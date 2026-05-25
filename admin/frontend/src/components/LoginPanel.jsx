import { useState } from 'react';

export default function LoginPanel({ onLogin, loading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <section className="card login-card">
      <h1>UVA Control Center</h1>
      <p className="muted">Operación, trazabilidad y programación en una sola consola.</p>
      <form onSubmit={submit} className="grid">
        <label>
          Correo administrador
          <input value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button disabled={loading}>{loading ? 'Ingresando...' : 'Ingresar'}</button>
      </form>
    </section>
  );
}
