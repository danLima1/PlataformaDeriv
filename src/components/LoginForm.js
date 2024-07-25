import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../scripts/AuthContext'; // Importe o AuthContext
import './css/LoginForm.css';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const { login } = useContext(AuthContext); // Use o AuthContext
  const navigate = useNavigate();

  const handleLogin = (event) => {
    event.preventDefault();
    const userData = JSON.parse(localStorage.getItem('user'));

    if (userData && userData.email === email && userData.password === senha) {
      console.log('Login successful');
      login(email); // Atualize o estado de autenticação global
      navigate('/dashboard'); // Redirecionar para o Dashboard após o login
    } else {
      console.error('Login failed');
      // Mostrar mensagem de erro
    }
  };

  return (
    <div className="login-container">
      <div className="login-card card mx-auto my-auto text-center rounded-0 p-0">
        <div className="card-body d-flex flex-column py-5 px-md-5">
          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <div className="mb-3 input-group fadeIn second">
                <label className="input-group-text" htmlFor="email"> <i className="fad fa-envelope"></i> </label>
                <input type="text" className="form-control" id="email" name="email" placeholder="Seu E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>
            <div className="mb-3">
              <div className="mb-3 input-group fadeIn third">
                <label className="input-group-text" htmlFor="senha"> <i className="fad fa-key"></i> </label>
                <input type="password" id="senha" className="form-control" name="senha" placeholder="Sua Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required />
                <label className="input-group-text" onMouseDown={() => document.getElementById('senha').type = 'text'} onMouseUp={() => document.getElementById('senha').type = 'password'}> <i className="fad fa-eye"></i> </label>
              </div>
            </div>
            <div className="mb-3">
              <div className="row">
                <div className="col-12 mb-3">
                  <input type="submit" name="btn" value="ENTRAR" className="btn btn-purple w-100" />
                </div>
              </div>
              <div className="row">
                <div className="col mb-3">
                  <a className="underlineHover" style={{ color: '#fff' }} href="https://superbots.com.br/login/recuperar">Esqueceu a senha?</a>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginForm;
