import React, { useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';

const Container = styled.div`
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0a0a;
`;

const Card = styled.div`
  width: 360px;
  background: #141414;
  border: 1px solid #222;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
`;

const Title = styled.h2`
  margin: 0 0 12px 0;
  color: #00ff88;
`;

const Sub = styled.p`
  margin: 0 0 24px 0;
  color: #999;
  font-size: 14px;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 12px;
  border-radius: 6px;
  border: 1px solid #333;
  background: #0f0f0f;
  color: #fff;
`;

const Button = styled.button`
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 6px;
  background: linear-gradient(45deg, #00ff88, #00cc6a);
  color: #000;
  font-weight: 600;
  cursor: pointer;
`;

const Error = styled.div`
  color: #ff6b6b;
  margin-bottom: 12px;
`;

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const doLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/login', { username, password });
      const token = res.data && res.data.token;
      if (!token) throw new Error('No token');
      localStorage.setItem('c2_token', token);
      onLoggedIn && onLoggedIn(token);
    } catch (err) {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <Card>
        <Title>FAHIS C2</Title>
        <Sub>Sign in to access the console</Sub>
        {error && <Error>{error}</Error>}
        <form onSubmit={doLogin}>
          <Input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
          <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          <Button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</Button>
        </form>
      </Card>
    </Container>
  );
}


