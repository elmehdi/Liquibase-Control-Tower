# Liquibase UI Manager

A modern web interface for managing Liquibase database migrations. This application provides a user-friendly way to execute Liquibase commands, validate changelog files, and manage database migrations through a clean, intuitive UI.

## Features

### 1. Directory Selection
- Select and validate working directory
- Automatic project structure detection
- Real-time directory validation

### 2. Mode Selection
Three main operational modes:

#### Check Mode
- Validates project structure
- Verifies changelog files
- Checks SQL syntax
- Provides automated fixes for common issues
- Real-time validation feedback
- Actionable suggestions for improvements

#### Build Mode
- Generate and manage changelog files
- Create SQL templates
- Version management
- Category-based organization:
  - Tables
  - Views
  - Materialized Views
  - Procedures
  - Sequences
- File upload support
- Real-time SQL formatting

#### Install Mode
Organized into three categories:

**Status & Validation**
- Check Status: Show pending changesets and current database state
- Validate Changelogs: Check if changelog files are correctly formatted

**Deployment**
- Preview Update SQL: Generate SQL for pending changes without executing
- Update Database: Apply all pending changesets
- Update Count: Apply specific number of pending changesets
- Create Tag: Create a new tag for rollback purposes

**Rollback**
- Rollback to Tag: Revert database changes to a specific tag
- Rollback Count: Revert specific number of changesets 
## Project Structure
.
├── src/ # Frontend React/TypeScript code
│ ├── components/ # React components
│ │ ├── Installer.tsx # Liquibase command execution UI
│ │ ├── Generator.tsx # Changelog generation UI
│ │ ├── Checker.tsx # Project structure validation
│ │ └── ...
│ ├── App.tsx # Main application component
│ └── main.tsx # Application entry point
│
├── server/ # Backend Node.js code
│ ├── controllers/ # Request handlers
│ │ ├── liquibase.js # Liquibase command execution
│ │ └── ...
│ ├── utils/ # Utility functions
│ └── index.js # Server entry point
│
├── liquibase/ # Liquibase workspace
│ └── liquibase.properties # Liquibase configuration
│
└── docker/ # Docker configuration
├── Dockerfile.frontend
├── Dockerfile.backend
└── Dockerfile.liquibase


## Technology Stack

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- Framer Motion (animations)
- Lucide React (icons)

### Backend
- Node.js
- Express
- XML processing (xml2js, xml-formatter)
- SQL formatting (sql-formatter)

### Infrastructure
- Docker
- Docker Compose
- Liquibase

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)

### Installation

1. Clone the repository:
bash
git clone [repository-url]
cd liquibase-ui-manager


2. Start the application using Docker Compose:
bash
docker-compose up


The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

### Local Development

1. Install dependencies:
bash
npm install

2. Start the development server:bash
npm run dev

This will start both the frontend and backend in development mode using `concurrently`.

## Architecture

### Component Interaction

The frontend components interact with the backend API through HTTP requests. The backend handles the execution of Liquibase commands and returns the results to the frontend.

### Docker Setup

The project is containerized using Docker. The `docker-compose.yml` file defines the services for the frontend, backend, and Liquibase.

Frontend (React/Vite)
│
▼
Backend (Node.js/Express)
│
▼
Liquibase Container


- Frontend sends command requests to the backend
- Backend validates and forwards commands to Liquibase
- Results are streamed back through the same path
- Real-time feedback is provided in the UI

## Development Workflow

1. **Directory Selection**
   - Select working directory
   - Validate directory structure

2. **Mode Selection**
   - Choose between Check, Build, or Install modes
   - Each mode provides specific functionality

3. **Operation Execution**
   - Execute commands based on selected mode
   - Real-time feedback and logs
   - Error handling and recovery options

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Liquibase for providing the database migration framework
- The React and TypeScript communities for excellent tools and documentation
