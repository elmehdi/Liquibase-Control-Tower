import React from 'react';
import { DirectorySelector } from './components/DirectorySelector';
import { ModeSelector } from './components/ModeSelector';
import { Header } from './components/Header';
import { Checker } from './components/Checker';
import { Generator } from './components/Generator';
import { ProjectSetup } from './components/ProjectSetup';

function App() {
  const [step, setStep] = React.useState<'directory' | 'mode' | 'check' | 'build'>('directory');
  const [workingDirectory, setWorkingDirectory] = React.useState('');

  const handleDirectorySelect = (directory: string) => {
    setWorkingDirectory(directory);
    setStep('mode');
  };

  const handleModeSelect = (mode: string) => {
    if (mode === 'check') {
      setStep('check');
    } else if (mode === 'build') {
      setStep('build');
    }
  };

  const handleHomeClick = () => {
    setStep('mode');
  };

  const renderContent = () => {
    switch (step) {
      case 'directory':
        return <DirectorySelector onSelect={handleDirectorySelect} />;
      case 'mode':
        return <ModeSelector onSelect={handleModeSelect} />;
      case 'check':
        return <Checker workingDirectory={workingDirectory} />;
      case 'build':
        return <Generator workingDirectory={workingDirectory} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {step !== 'directory' && <Header onHomeClick={handleHomeClick} />}
      <main className="py-6">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;