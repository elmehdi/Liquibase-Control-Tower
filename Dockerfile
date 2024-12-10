# Stage 1: Build the React application
FROM node:18-alpine as client-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Set up Java and Liquibase
FROM openjdk:11-jre-slim

# Install necessary tools and Liquibase
WORKDIR /app
RUN apt-get update && \
    apt-get install -y wget unzip curl && \
    wget https://github.com/liquibase/liquibase/releases/download/v4.25.1/liquibase-4.25.1.zip && \
    unzip liquibase-4.25.1.zip -d /usr/local/lib/liquibase && \
    rm liquibase-4.25.1.zip && \
    ln -s /usr/local/lib/liquibase/liquibase /usr/local/bin/ && \
    # Install Node.js for the server
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    # Clean up
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create necessary directories
RUN mkdir -p /app/lib /app/logs

# Copy Oracle JDBC driver (you need to download this separately)
COPY ./lib/ojdbc8.jar /app/lib/

# Copy application files
COPY --from=client-builder /app/dist /app/dist
COPY server /app/server
COPY package*.json /app/
COPY liquibase.properties /app/

# Install server dependencies
RUN npm install --production

# Set environment variables
ENV PATH="/usr/local/bin:${PATH}"
ENV LIQUIBASE_HOME="/usr/local/lib/liquibase"

# Expose the port your app runs on
EXPOSE 3000

# Start the application
CMD ["node", "server/index.js"]
