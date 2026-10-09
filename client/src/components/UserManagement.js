import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { 
  FiUsers, 
  FiPlus, 
  FiEdit3, 
  FiTrash2, 
  FiUser,
  FiSave,
  FiX,
  FiMail
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import axios from 'axios';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.div`
  padding: 25px;
  max-width: 1200px;
  margin: 0 auto;
  animation: ${fadeIn} 0.6s ease-out;
`;

const Header = styled.div`
  background: #161a22;
  border-radius: 16px;
  padding: 30px;
  margin-bottom: 30px;
  border: 1px solid #2a3140;
  
  h1 {
    color: #c6f23e;
    font-size: 28px;
    font-weight: 600;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 15px;
  }
  
  p {
    color: #888;
    margin: 10px 0 0 0;
    font-size: 16px;
  }
`;

const ActionsBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
`;

const AddButton = styled.button`
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
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(198, 242, 62, 0.3);
  }
`;

const UsersGrid = styled.div`
  display: grid;
  gap: 20px;
`;

const UserCard = styled.div`
  background: #161a22;
  border-radius: 12px;
  padding: 25px;
  border: 1px solid #2a3140;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
    border-color: #c6f23e;
  }
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`;

const UserAvatar = styled.div`
  width: 50px;
  height: 50px;
  border-radius: 12px;
  background: linear-gradient(135deg, #c6f23e, #8fb820);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #000;
  font-size: 20px;
  font-weight: 600;
`;

const UserDetails = styled.div`
  .name {
    font-size: 18px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 5px;
  }

  .email {
    color: #888;
    font-size: 13px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .role {
    display: inline-block;
    background: ${props => props.role === 'admin' ? 
      'rgba(255, 107, 107, 0.2)' : 
      'rgba(198, 242, 62, 0.2)'};
    color: ${props => props.role === 'admin' ? '#ff6b6b' : '#c6f23e'};
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
  }
`;

const UserActions = styled.div`
  display: flex;
  gap: 10px;
`;

const ActionButton = styled.button`
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #2a3140;
  color: #ccc;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.danger ? 
      'rgba(255, 107, 107, 0.2)' : 
      'rgba(198, 242, 62, 0.2)'};
    border-color: ${props => props.danger ? '#ff6b6b' : '#c6f23e'};
    color: ${props => props.danger ? '#ff6b6b' : '#c6f23e'};
  }
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: #1a1a1a;
  border: 1px solid #2a3140;
  border-radius: 12px;
  padding: 30px;
  width: 500px;
  max-width: 90vw;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 25px;
  
  h2 {
    color: #c6f23e;
    font-size: 20px;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    color: #ff6b6b;
    background: rgba(255, 107, 107, 0.1);
  }
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
  
  label {
    display: block;
    color: #ccc;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 8px;
  }

  .hint {
    color: #666;
    font-size: 12px;
    margin-top: 6px;
  }
`;

const Input = styled.input`
  width: 100%;
  background: #0a0a0a;
  border: 1px solid #2a3140;
  color: #fff;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #c6f23e;
  }
`;

const Select = styled.select`
  width: 100%;
  background: #0a0a0a;
  border: 1px solid #2a3140;
  color: #fff;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #c6f23e;
  }

  option {
    background: #0a0a0a;
    color: #fff;
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 15px;
  margin-top: 25px;
`;

const SaveButton = styled.button`
  flex: 1;
  background: linear-gradient(135deg, #c6f23e, #8fb820);
  border: none;
  color: #000;
  padding: 12px 20px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 600;
  transition: all 0.2s;

  &:hover {
    background: linear-gradient(135deg, #b5e036, #7a9e1a);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CancelButton = styled.button`
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #2a3140;
  color: #ccc;
  padding: 12px 20px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 600;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }
`;

const emptyForm = { username: '', password: '', email: '', role: 'user' };

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await axios.get('/api/users', {
        headers: { Authorization: `Bearer ${localStorage.getItem('fahis_token')}` }
      });
      setUsers(response.data.users || []);
    } catch (error) {
      toast.error('Failed to load users');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username) {
      toast.error('Username is required');
      return;
    }
    if (!editingUser && !formData.password) {
      toast.error('Password is required');
      return;
    }
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      toast.error('A valid Gmail/email is required for OTP');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        username: formData.username,
        role: formData.role,
        email: formData.email.trim().toLowerCase()
      };
      if (formData.password) payload.password = formData.password;

      if (editingUser) {
        await axios.put(`/api/users/${editingUser.username}`, payload, {
          headers: { Authorization: `Bearer ${localStorage.getItem('fahis_token')}` }
        });
        toast.success('User updated successfully');
      } else {
        await axios.post('/api/users', { ...payload, password: formData.password }, {
          headers: { Authorization: `Bearer ${localStorage.getItem('fahis_token')}` }
        });
        toast.success('User created successfully');
      }
      
      setShowModal(false);
      setEditingUser(null);
      setFormData(emptyForm);
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      email: user.email || '',
      role: user.role
    });
    setShowModal(true);
  };

  const handleDelete = async (username) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }

    try {
      await axios.delete(`/api/users/${username}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('fahis_token')}` }
      });
      toast.success('User deleted successfully');
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete user');
    }
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingUser(null);
    setShowModal(false);
  };

  return (
    <Container>
      <Header>
        <div>
          <h1>
            <FiUsers />
            User Management
          </h1>
          <p>Manage !0 accounts — Gmail is used to send login OTP in production</p>
        </div>
      </Header>

      <ActionsBar>
        <AddButton onClick={() => setShowModal(true)}>
          <FiPlus />
          Add New User
        </AddButton>
      </ActionsBar>

      <UsersGrid>
        {users.map(user => (
          <UserCard key={user.username}>
            <UserInfo>
              <UserAvatar>
                {user.username.charAt(0).toUpperCase()}
              </UserAvatar>
              <UserDetails role={user.role}>
                <div className="name">{user.username}</div>
                <div className="email">
                  <FiMail size={12} />
                  {user.email || 'No email set (OTP will fail in production)'}
                </div>
                <span className="role">{user.role}</span>
              </UserDetails>
            </UserInfo>
            
            <UserActions>
              <ActionButton onClick={() => handleEdit(user)}>
                <FiEdit3 />
                Edit
              </ActionButton>
              <ActionButton danger onClick={() => handleDelete(user.username)}>
                <FiTrash2 />
                Delete
              </ActionButton>
            </UserActions>
          </UserCard>
        ))}
        
        {users.length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            color: '#666', 
            padding: '40px',
            fontSize: '16px'
          }}>
            No users found. Create your first user account.
          </div>
        )}
      </UsersGrid>

      {showModal && (
        <Modal onClick={resetForm}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <h2>
                <FiUser />
                {editingUser ? 'Edit User' : 'Add New User'}
              </h2>
              <CloseButton onClick={resetForm}>
                <FiX />
              </CloseButton>
            </ModalHeader>

            <form onSubmit={handleSubmit}>
              <FormGroup>
                <label>Username</label>
                <Input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  placeholder="Enter username"
                  disabled={editingUser !== null}
                />
              </FormGroup>

              <FormGroup>
                <label>Gmail / Email (for OTP)</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="user@gmail.com"
                  required
                />
                <div className="hint">Login OTP is emailed here in production</div>
              </FormGroup>

              <FormGroup>
                <label>Password</label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  placeholder={editingUser ? "Leave blank to keep current password" : "Enter password"}
                />
              </FormGroup>

              <FormGroup>
                <label>Role</label>
                <Select
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </Select>
              </FormGroup>

              <ModalActions>
                <SaveButton type="submit" disabled={loading}>
                  <FiSave />
                  {loading ? 'Saving...' : 'Save User'}
                </SaveButton>
                <CancelButton type="button" onClick={resetForm}>
                  <FiX />
                  Cancel
                </CancelButton>
              </ModalActions>
            </form>
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
};

export default UserManagement;
