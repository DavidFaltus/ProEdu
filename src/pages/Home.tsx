import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user } = useAuth();
  return (
    <div className="home-container">
      <main className="hero">
        <div className="content">
          <div className="logo-wrapper">
            <img src="/foto/logo.png" alt="ProEdu" className="logo-img" />
            <span className="cator">-cator</span>
            <img src="/foto/trophy.png" alt="Trofej" className="trophy-img" />
          </div>

          <h2 className="slogan">Výuková aplikace, která se Ti přizpůsobí.</h2>
          <p className="description">
            Jednoduché ovládání - maximální procvičení.<br />
            Připrav se s námi na přijímačky nebo na didakťáky ještě dnes.
          </p>

          <div className="cta-text">Procvičuj <span>ZDARMA</span></div>

          <div className="button-group">
            <Link to={user ? "/practice" : "/login"} className="btn-custom btn-orange-custom">
              Přijímačky na SŠ
            </Link>
            <Link to={user ? "/practice" : "/login"} className="btn-custom btn-purple-custom">
              Příprava na maturitu
            </Link>
          </div>
        </div>

        <div className="illustration">
          <img src="/foto/knihy_title.png" alt="Ilustrace knih" />
        </div>
      </main>

      <footer className="home-footer">
        <div className="footer-left">
          Vytvořeno s láskou ke studentům ❤️ <strong>©ProEdu, s. r. o.</strong>
        </div>
        <div className="footer-right">
          <Link to="#">Web s obchodními podmínkami</Link>
        </div>
      </footer>
    </div>
  );
}
