export const getVersionFromTag = async (workingDirectory: string): Promise<string | null> => {
    try {
      const response = await fetch(`http://localhost:3000/api/check-tag-database`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workingDirectory }),
      });
  
      if (!response.ok) {
        return null;
      }
  
      const data = await response.json();
      return data.version || null;
    } catch (error) {
      console.error('Error checking tag-database:', error);
      return null;
    }
  };