import { Link } from 'react-router-dom';

export function NoEncontrada() {
  return (
    <main className="pantalla-login">
      <div className="tarjeta">
        <h1>Página no encontrada</h1>
        <p>La dirección no existe.</p>
        <Link to="/" className="boton boton-primario">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
