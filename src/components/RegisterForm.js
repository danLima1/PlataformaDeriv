import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './css/RegisterForm.css';

function RegisterForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleRegister = (event) => {
    event.preventDefault();
    const userData = { name, email, phone, password };
    
    // Salvar os dados do usuário no localStorage
    localStorage.setItem('user', JSON.stringify(userData));
    
    // Redirecionar para a página de login
    navigate('/');
  };

  return (
    <div className="register-container">
      <div className="register-card card mx-auto my-auto text-center rounded-0 p-0">
        <div className="card-body d-flex flex-column py-5 px-md-5">
          <form onSubmit={handleRegister}>
            <div className="mb-3 input-group">
              <span className="input-group-text"> <i className="fa fa-user"></i> </span>
              <input name="name" value={name} onChange={(e) => setName(e.target.value)} className="form-control" placeholder="Nome" type="text" required />
            </div>
            <div className="mb-3 input-group">
              <span className="input-group-text"> <i className="fa fa-envelope"></i> </span>
              <input name="email" value={email} onChange={(e) => setEmail(e.target.value)} className="form-control" placeholder="E-mail" type="email" required />
            </div> 
            <div className="mb-3 input-group">
              <span className="input-group-text"> <i className="fa fa-phone"></i> </span>
              <input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="form-control" placeholder="Telefone" type="tel" required />
            </div>
            <div className="mb-3 input-group">
              <span className="input-group-text"> <i className="fa fa-lock"></i> </span>
              <input name="password" value={password} onChange={(e) => setPassword(e.target.value)} className="form-control" placeholder="Crie uma senha" type="password" required />
            </div> 
            <div className="form-check">
              <input type="checkbox" className="form-check-input" required />
              <small className="text-light">Eu concordo totalmente com os <a href="https://superbots.com.br/termo" target="_blank">termos de uso do sistema</a>.</small>
            </div>
            <div className="mb-3">
              <div className="row">
                <div className="col-12 mb-3">
                  <input type="submit" name="btn" value="ENVIAR" className="btn btn-purple w-100" />
                </div>
              </div>
            </div>
          </form>
        </div>
        <div className="p-3 px-md-5">
          <div className="col-12 mb-3">
            <a href="/login" className="btn btn-purple w-100">LOGIN</a>
          </div>
        </div>
        <div className="p-3 text-light">
          © 2024 - <a href="#" target="_blank" className="text-light">Plataformas Auto Bots</a>
        </div>
      </div>
    </div>
  );
}

export default RegisterForm;
