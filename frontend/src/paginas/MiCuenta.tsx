import { FormContrasena } from '../componentes/FormContrasena';
import { useUsuario } from '../sesion/SesionContexto';

/**
 * «Mi cuenta» (panel/mi_cuenta.php), para cualquier rol: el nombre de la cuenta y el cambio de la
 * contraseña propia. Como en PHP, no edita datos personales: los de pacientes y médicos los edita recepción.
 */
export function MiCuenta() {
  const usuario = useUsuario();

  return (
    <section className="cuenta-contenido">
      <h1>Mi cuenta</h1>
      <p className="cuenta-subtitulo">
        {usuario.nombre} {usuario.apellido}
      </p>
      <FormContrasena email={usuario.email} />
    </section>
  );
}
