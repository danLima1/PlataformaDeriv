import React, { useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../scripts/AuthContext';
import '../App.css';

function Navbar() {
  const { isLoggedIn, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="navbar navbar-expand-lg bg-body-tertiary sticky-top border-bottom border-light">
      <div className="full-width-container">
        <button className="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#offcanvasNavbar" aria-controls="offcanvasNavbar" aria-label="Toggle navigation">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="offcanvas offcanvas-end" tabIndex="-1" id="offcanvasNavbar" aria-labelledby="offcanvasNavbarLabel">
          <div className="offcanvas-header">
            <a className="navbar-brand" href="/"><img src="" height="32" alt="Logo" /></a>
            <button type="button" className="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
          </div>
          <div className="offcanvas-body">
            <ul className="navbar-nav justify-content-center flex-grow-1 pe-3">
              <li className="nav-item">
                <Link className="nav-link active" aria-current="page" to={isLoggedIn ? "/dashboard" : "/"}>Inicio</Link>
              </li>
              <li className="nav-item dropdown has-megamenu">
                <a className="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown"> Menu </a>
                <div className="dropdown-menu megamenu rounded-0" role="menu">
                  <div className="container">
                    <div className="row g-3">
                      <div className="col-lg-3 col-12">
                        <div className="col-megamenu">
                          <h6 className="title text-warning">Produtividade</h6>
                          <nav className="nav flex-column nav-pills mb-3">
                            <a href="https://superbots.com.br/links" className="nav-item text-start btn btn-outline-light border-0 d-flex gap-3"><i className="fad fa-link my-auto"></i>Links Úteis</a>
                            <a href="https://superbots.com.br/moedas" className="nav-item text-start btn btn-outline-light border-0 d-flex gap-3"><i className="fad fa-search-dollar my-auto"></i>Cotações</a>
                          </nav>
                        </div>
                      </div>
                      <div className="col-lg-3 col-12">
                        <div className="col-megamenu">
                          <h6 className="title text-warning">Crescimento pessoal</h6>
                          <nav className="nav flex-column nav-pills mb-3">
                            <a href="https://superbots.com.br/marketplace" className="nav-item text-start btn btn-outline-light border-0 d-flex gap-3"><i className="fad fa-store my-auto"></i>Marketplace</a>
                            <a href="https://superbots.com.br/galeria" className="nav-item text-start btn btn-outline-light border-0 d-flex gap-3"><i className="fad fa-play my-auto"></i>Videos</a>
                          </nav>
                        </div> 
                      </div>
                    </div>
                  </div>
                </div> 
              </li>
              <li className="nav-item dropdown">
                <a className="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown"> Corporação </a>
                <div className="dropdown-menu p-3" role="menu">
                  <h6 className="title text-warning">Sobre</h6>
                  <nav className="nav flex-column nav-pills">
                    <a href="https://superbots.com.br/sobre" className="nav-item text-start btn btn-outline-light border-0 text-nowrap"><i className="fad fa-copyright my-auto me-2"></i>Quem Somos</a>
                    <a href="https://superbots.com.br/termo" className="nav-item text-start btn btn-outline-light border-0 text-nowrap"><i className="fad fa-file-contract my-auto me-2"></i>Termo e Condições</a>
                  </nav>
                </div> 
              </li>
            </ul>
            <ul className="navbar-nav">
              <li className="nav-item"><a className="nav-link d-flex justify-content-between disabled gap-2">Onlines<b style={{color:'#0f0!important'}} id="onlines">352</b></a></li>
              {isLoggedIn ? (
                <>
                  <Link className="nav-link" aria-current="page" to="/" onClick={handleLogout}>Logout</Link>
                </>
              ) : (
                <>
                  <Link className="nav-link" aria-current="page" to="/">Login</Link>
                  <Link className="nav-link" aria-current="page" to="/register">Inscreva-se</Link>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
