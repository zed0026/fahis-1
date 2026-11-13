import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FiCopy, FiDownload, FiPackage, FiRefreshCw } from 'react-icons/fi';
import { ARTIFACTS_PAGE_PATH } from '../config/paths';

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('fahis_token') || ''}`,
});

const formatBytes = (n) => {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KiB`;
  return `${(v / (1024 * 1024)).toFixed(2)} MiB`;
};

const Section = styled.section`
  animation: fadeIn 0.35s ease-out;
  min-height: calc(100vh - 120px);

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

const Head = styled.div`
  margin-bottom: 24px;

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
    max-width: 720px;
    line-height: 1.55;
  }

  code {
    color: #c6f23e;
    font-size: 12px;
  }
`;

const MetaCard = styled.div`
  background: rgba(198, 242, 62, 0.06);
  border: 1px solid rgba(198, 242, 62, 0.22);
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 20px;
  font-size: 13px;
  color: #aeb6c7;
  line-height: 1.6;

  strong {
    color: #c6f23e;
    font-weight: 600;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: #12151c;
  border: 1px solid #2a3140;
  border-radius: 12px;
  overflow: hidden;

  th,
  td {
    padding: 12px 14px;
    text-align: left;
    border-bottom: 1px solid #2a3140;
    font-size: 13px;
  }

  th {
    color: #8b93a7;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    background: #161a22;
  }

  td {
    color: #eef1f6;
  }

  tr:last-child td {
    border-bottom: none;
  }
`;

const Kind = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  background: ${(p) =>
    p.$kind === 'exe'
      ? 'rgba(198, 242, 62, 0.15)'
      : p.$kind === 'dll'
        ? 'rgba(90, 140, 255, 0.15)'
        : 'rgba(255, 255, 255, 0.06)'};
  color: ${(p) => (p.$kind === 'exe' ? '#c6f23e' : p.$kind === 'dll' ? '#8eb6ff' : '#aeb6c7')};
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const Btn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid #2a3140;
  background: #161a22;
  color: #c6f23e;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;

  &:hover {
    background: rgba(198, 242, 62, 0.1);
    border-color: rgba(198, 242, 62, 0.35);
  }
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
`;

const Empty = styled.div`
  padding: 48px 24px;
  text-align: center;
  color: #8b93a7;
  border: 1px dashed #2a3140;
  border-radius: 12px;

  h3 {
    margin: 0 0 8px;
    color: #eef1f6;
    font-size: 16px;
  }
`;

export default function WorkingArtifacts() {
  const [data, setData] = useState({ meta: null, files: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/working/list', { headers: authHeaders() });
      setData(res.data || { meta: null, files: [] });
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load production files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const token = localStorage.getItem('fahis_token') || '';
  const downloadHref = (name) =>
    `/api/working/download/${encodeURIComponent(name)}?token=${encodeURIComponent(token)}`;

  const copyLink = (name) => {
    const url = `${window.location.origin}${downloadHref(name)}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Download link copied (valid while logged in)'))
      .catch(() => toast.error('Could not copy link'));
  };

  const meta = data.meta;

  return (
    <Section>
      <Head>
        <h2>
          <FiPackage style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Production files
        </h2>
        <p>
          Latest ops artifacts from <code>builds/working</code> on this server — stealth EXE,
          inject DLL, and meta. Bookmark{' '}
          <code>
            {typeof window !== 'undefined' ? window.location.origin : ''}
            {ARTIFACTS_PAGE_PATH}
          </code>{' '}
          (login required). Rebuild with <code>npm run build:prod-exe</code> on the teamserver to refresh.
        </p>
      </Head>

      {meta && (
        <MetaCard>
          <div>
            <strong>C2 embed:</strong> {meta.host}:{meta.port}
          </div>
          {meta.sha256 && (
            <div>
              <strong>EXE SHA256:</strong> <span style={{ wordBreak: 'break-all' }}>{meta.sha256}</span>
            </div>
          )}
          {meta.injectDllSha256 && (
            <div>
              <strong>DLL SHA256:</strong>{' '}
              <span style={{ wordBreak: 'break-all' }}>{meta.injectDllSha256}</span>
            </div>
          )}
          {meta.createdAt && (
            <div>
              <strong>Built:</strong> {new Date(meta.createdAt).toLocaleString()}
            </div>
          )}
        </MetaCard>
      )}

      <Toolbar>
        <Btn type="button" onClick={load} disabled={loading}>
          <FiRefreshCw /> Refresh
        </Btn>
      </Toolbar>

      {loading ? (
        <Empty>Loading…</Empty>
      ) : !data.files?.length ? (
        <Empty>
          <h3>No files in builds/working</h3>
          <p>Run npm run build:prod-exe on this host, then refresh.</p>
        </Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Size</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.files.map((f) => (
              <tr key={f.name}>
                <td>{f.name}</td>
                <td>
                  <Kind $kind={f.kind}>{f.kind}</Kind>
                </td>
                <td>{formatBytes(f.size)}</td>
                <td>{new Date(f.updatedAt).toLocaleString()}</td>
                <td>
                  <Actions>
                    <Btn as="a" href={downloadHref(f.name)} download={f.name}>
                      <FiDownload /> Download
                    </Btn>
                    <Btn type="button" onClick={() => copyLink(f.name)}>
                      <FiCopy /> Copy link
                    </Btn>
                  </Actions>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Section>
  );
}
