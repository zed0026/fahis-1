import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import {
  FiCamera,
  FiDownload,
  FiEye,
  FiTrash2,
  FiClock,
  FiImage
} from 'react-icons/fi';
import { toast } from 'react-toastify';

const ScreenshotsContainer = styled.div`
  background: #0a0a0a;
  border-radius: 12px;
  border: 1px solid #2a3140;
  height: 100%;
  max-height: 100%;
  min-height: 0;
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
  background: linear-gradient(135deg, #c6f23e, #8fb820);
  border: none;
  color: #000;
  padding: 12px 20px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Content = styled.div`
  flex: 1;
  min-height: 0;
  padding: 20px 20px 48px;
  overflow-y: auto;
`;

const ScreenshotGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
`;

const ScreenshotCard = styled.div`
  background: #161a22;
  border-radius: 12px;
  border: 1px solid #2a3140;
  overflow: hidden;
`;

const ScreenshotImage = styled.div`
  width: 100%;
  height: 200px;
  background: #0a0a0a;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 48px;
  border-bottom: 1px solid #333;
  cursor: pointer;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #111;
  }
`;

const ScreenshotInfo = styled.div`
  padding: 16px;
`;

const ScreenshotName = styled.div`
  color: #fff;
  font-weight: 500;
  margin-bottom: 8px;
  font-size: 14px;
  word-break: break-all;
`;

const ScreenshotDetails = styled.div`
  display: flex;
  justify-content: space-between;
  color: #888;
  font-size: 12px;
  margin-bottom: 12px;
`;

const ScreenshotActions = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionBtn = styled.button`
  flex: 1;
  background: rgba(198, 242, 62, 0.12);
  border: 1px solid #c6f23e;
  color: #c6f23e;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;

  &.danger {
    background: rgba(255, 107, 107, 0.12);
    border-color: #ff6b6b;
    color: #ff6b6b;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: #666;
  .icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
  h3 { color: #888; margin-bottom: 8px; }
`;

const Modal = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 24px;
`;

const ModalContent = styled.div`
  position: relative;
  max-width: 95vw;
  max-height: 90vh;
  background: #111;
  border: 1px solid #2a3140;
  border-radius: 12px;
  padding: 12px;
`;

const ModalClose = styled.button`
  position: absolute;
  top: -12px;
  right: -12px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid #2a3140;
  background: #1a1a1a;
  color: #fff;
  cursor: pointer;
  font-size: 20px;
`;

const ModalImage = styled.img`
  max-width: 90vw;
  max-height: 80vh;
  display: block;
  object-fit: contain;
`;

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

function saveBlobToPc(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'screenshot.bmp';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'image/bmp' });
}

const Screenshots = ({ client, socket }) => {
  const [screenshots, setScreenshots] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const captureTimeout = useRef(null);

  const addScreenshotItem = (item) => {
    setScreenshots((prev) => {
      if (prev.some((p) => p.filename === item.filename && p.size === item.size)) {
        return prev;
      }
      return [item, ...prev];
    });
    setCapturing(false);
    if (captureTimeout.current) {
      clearTimeout(captureTimeout.current);
      captureTimeout.current = null;
    }
  };

  useEffect(() => {
    if (!socket || !client) return;

    const handleCommandResponse = (data) => {
      if (!data || data.clientId !== client.id) return;
      const text = String(data.response || '');
      if (/Snapshot saved as:/i.test(text)) {
        toast.info('Screenshot taken — pulling file to server…');
        return;
      }
      if (/Failed to capture|Snapshot only supported|Failed to create snapshot/i.test(text)) {
        setCapturing(false);
        toast.error(text.split('\n')[0]);
      }
    };

    const handleScreenshotReady = (payload) => {
      if (!payload || payload.clientId !== client.id || !payload.dataBase64) return;
      try {
        const mime = payload.mime || 'image/bmp';
        const blob = base64ToBlob(payload.dataBase64, mime);
        const previewUrl = URL.createObjectURL(blob);
        addScreenshotItem({
          id: `${Date.now()}_${payload.filename}`,
          name: payload.filename,
          filename: payload.filename,
          clientDir: payload.clientDir,
          timestamp: new Date(),
          size: formatBytes(payload.size || blob.size),
          previewUrl,
          blob,
          mime
        });
        toast.success('Screenshot ready — preview & download available');
      } catch (err) {
        setCapturing(false);
        toast.error(err.message || 'Could not load screenshot');
      }
    };

    socket.on('commandResponse', handleCommandResponse);
    socket.on('screenshotReady', handleScreenshotReady);
    return () => {
      socket.off('commandResponse', handleCommandResponse);
      socket.off('screenshotReady', handleScreenshotReady);
    };
  }, [socket, client?.id]);

  useEffect(() => {
    return () => {
      screenshots.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
      if (captureTimeout.current) clearTimeout(captureTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCaptureScreenshot = () => {
    if (!client || !socket || capturing) return;
    setCapturing(true);
    socket.emit('executeCommand', {
      clientId: client.id,
      command: 'screenshot'
    });
    captureTimeout.current = setTimeout(() => {
      setCapturing(false);
      toast.error('Screenshot timed out — is the target online with the new implant?');
    }, 90000);
  };

  const handleDownload = (screenshot) => {
    try {
      if (!screenshot.blob) {
        toast.error('No screenshot data to download');
        return;
      }
      saveBlobToPc(screenshot.blob, screenshot.name || 'screenshot.bmp');
      toast.success(`Downloading to your PC: ${screenshot.name}`);
    } catch (err) {
      toast.error(err.message || 'Download failed');
    }
  };

  const handleDelete = (screenshotId) => {
    setScreenshots((prev) => {
      const item = prev.find((s) => s.id === screenshotId);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((s) => s.id !== screenshotId);
    });
    if (selectedImage?.id === screenshotId) setSelectedImage(null);
  };

  if (!client) {
    return (
      <ScreenshotsContainer>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
          Select a client to capture screenshots
        </div>
      </ScreenshotsContainer>
    );
  }

  return (
    <ScreenshotsContainer>
      <Header>
        <Title>
          <FiCamera />
          Screenshot Capture
        </Title>
        <ActionButton onClick={handleCaptureScreenshot} disabled={capturing || !client.active}>
          <FiCamera />
          {capturing ? 'Capturing…' : 'Capture Screenshot'}
        </ActionButton>
      </Header>

      <Content>
        {screenshots.length === 0 ? (
          <EmptyState>
            <FiCamera className="icon" />
            <h3>No Screenshots Captured</h3>
            <p>Click Capture — image is pulled from the target to the server, then shown here for PC download.</p>
          </EmptyState>
        ) : (
          <ScreenshotGrid>
            {screenshots.map((screenshot) => (
              <ScreenshotCard key={screenshot.id}>
                <ScreenshotImage onClick={() => setSelectedImage(screenshot)}>
                  {screenshot.previewUrl ? (
                    <img src={screenshot.previewUrl} alt={screenshot.name} />
                  ) : (
                    <FiImage />
                  )}
                </ScreenshotImage>
                <ScreenshotInfo>
                  <ScreenshotName>{screenshot.name}</ScreenshotName>
                  <ScreenshotDetails>
                    <span>
                      <FiClock style={{ marginRight: 4 }} />
                      {screenshot.timestamp.toLocaleString()}
                    </span>
                    <span>{screenshot.size}</span>
                  </ScreenshotDetails>
                  <ScreenshotActions>
                    <ActionBtn onClick={() => setSelectedImage(screenshot)}>
                      <FiEye /> View
                    </ActionBtn>
                    <ActionBtn onClick={() => handleDownload(screenshot)}>
                      <FiDownload /> Download
                    </ActionBtn>
                    <ActionBtn className="danger" onClick={() => handleDelete(screenshot.id)}>
                      <FiTrash2 /> Delete
                    </ActionBtn>
                  </ScreenshotActions>
                </ScreenshotInfo>
              </ScreenshotCard>
            ))}
          </ScreenshotGrid>
        )}
      </Content>

      {selectedImage && (
        <Modal onClick={() => setSelectedImage(null)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalClose onClick={() => setSelectedImage(null)}>×</ModalClose>
            {selectedImage.previewUrl ? (
              <ModalImage src={selectedImage.previewUrl} alt={selectedImage.name} />
            ) : (
              <div style={{ color: '#888', padding: 40 }}>No preview</div>
            )}
          </ModalContent>
        </Modal>
      )}
    </ScreenshotsContainer>
  );
};

export default Screenshots;
