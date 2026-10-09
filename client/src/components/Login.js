import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import axios from 'axios';
import { FiShield, FiKey, FiUser, FiLock } from 'react-icons/fi';

const slideIn = keyframes`
  from { opacity: 0; transform: translateY(-20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

const Container = styled.div`
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(900px 500px at 15% 10%, rgba(198, 242, 62, 0.12), transparent 55%),
    radial-gradient(700px 400px at 90% 80%, rgba(90, 140, 255, 0.08), transparent 50%),
    #0e1014;
  position: relative;
  font-family: 'DM Sans', system-ui, sans-serif;
`;

const Card = styled.div`
  width: 420px;
  background: #161a22;
  border: 1px solid #2a3140;
  border-radius: 18px;
  padding: 42px 40px;
  position: relative;
  animation: ${slideIn} 0.55s cubic-bezier(0.4, 0, 0.2, 1);
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 32px;
`;

const Logo = styled.div`
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -0.05em;
  color: #c6f23e;
  line-height: 1;
  margin-bottom: 12px;
`;

const Title = styled.h1`
  margin: 0 0 8px 0;
  color: #eef1f6;
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
`;

const Sub = styled.p`
  margin: 0;
  color: #8b93a7;
  font-size: 14px;
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
`;

const InputLabel = styled.label`
  display: block;
  color: #ccc;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
`;

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const InputIcon = styled.div`
  position: absolute;
  left: 15px;
  color: #666;
  font-size: 16px;
  z-index: 1;
`;

const Input = styled.input`
  width: 100%;
  padding: 15px 15px 15px 45px;
  border-radius: 10px;
  border: 1px solid #2a3140;
  background: #0a0a0a;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;

  &:focus {
    border-color: #c6f23e;
    box-shadow: 0 0 0 3px rgba(198, 242, 62, 0.12);
  }

  &::placeholder {
    color: #666;
  }
`;

const Button = styled.button`
  width: 100%;
  padding: 15px 20px;
  border: none;
  border-radius: 10px;
  background: #c6f23e;
  color: #0e1014;
  font-weight: 700;
  font-size: 15px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 10px;

  &:hover:not(:disabled) {
    background: #d4ff5a;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const LinkButton = styled.button`
  background: none;
  border: none;
  color: #888;
  font-size: 13px;
  cursor: pointer;
  margin-top: 16px;
  width: 100%;
  text-align: center;

  &:hover {
    color: #c6f23e;
  }
`;

const Error = styled.div`
  color: #ff6b6b;
  margin-bottom: 15px;
  padding: 12px;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 8px;
  font-size: 14px;
`;

const Info = styled.div`
  color: #9ecf3a;
  margin-bottom: 15px;
  padding: 12px;
  background: rgba(76, 154, 255, 0.1);
  border: 1px solid rgba(76, 154, 255, 0.3);
  border-radius: 8px;
  font-size: 13px;
  text-align: center;
`;

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpEmailed, setOtpEmailed] = useState(false);
  const [step, setStep] = useState('login'); // login | otp
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const clearOtpState = () => {
    setOtp('');
    setOtpCode('');
    setMaskedEmail('');
    setOtpEmailed(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      setError('Username and password required');
      return;
    }

    setLoading(true);
    try {
      const verify = await axios.post('/api/verify-credentials', { username, password });
      if (!verify.data?.valid) {
        throw new Error(verify.data?.error || 'Invalid credentials');
      }

      setOtpCode(verify.data.demoOtp || '');
      setMaskedEmail(verify.data.maskedEmail || '');
      setOtpEmailed(Boolean(verify.data.otpEmailed));
      setStep('otp');
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Invalid credentials');
      clearOtpState();
      setStep('login');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await axios.post('/api/verify-otp', { username, password, otp });
      const token = res.data?.token;
      if (!token) throw new Error('Authentication failed');

      clearOtpState();
      localStorage.setItem('fahis_token', token);
      onLoggedIn && onLoggedIn(token);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  const backToLogin = () => {
    clearOtpState();
    setStep('login');
    setError('');
  };

  return (
    <Container>
      <Card>
        <Header>
          <Logo>!0</Logo>
          <Title>{step === 'login' ? 'Sign in' : 'Verify OTP'}</Title>
          <Sub>{step === 'login' ? 'Enter your credentials to continue' : 'Check your email for the code'}</Sub>
        </Header>

        {error && <Error>{error}</Error>}
        {step === 'otp' && (
          <Info>
            {otpEmailed && maskedEmail
              ? <>OTP sent to <strong>{maskedEmail}</strong>. Check your Gmail.</>
              : 'Enter the OTP to continue.'}
            {otpCode ? <> Demo code: <strong>{otpCode}</strong></> : null}
          </Info>
        )}

        {step === 'login' ? (
          <form onSubmit={handleLogin}>
            <FormGroup>
              <InputLabel>Username</InputLabel>
              <InputWrapper>
                <InputIcon><FiUser /></InputIcon>
                <Input
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </InputWrapper>
            </FormGroup>

            <FormGroup>
              <InputLabel>Password</InputLabel>
              <InputWrapper>
                <InputIcon><FiLock /></InputIcon>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </InputWrapper>
            </FormGroup>

            <Button type="submit" disabled={loading || !username || !password}>
              <FiShield />
              {loading ? 'Verifying...' : 'Login'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <FormGroup>
              <InputLabel>OTP Code</InputLabel>
              <InputWrapper>
                <InputIcon><FiKey /></InputIcon>
                <Input
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  autoFocus
                />
              </InputWrapper>
            </FormGroup>

            <Button type="submit" disabled={loading || otp.length !== 6}>
              <FiKey />
              {loading ? 'Verifying OTP...' : 'Verify OTP'}
            </Button>

            <LinkButton type="button" onClick={backToLogin}>
              ← Back to Login
            </LinkButton>
          </form>
        )}
      </Card>
    </Container>
  );
}
