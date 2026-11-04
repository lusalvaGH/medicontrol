import { useState } from 'react';
import { usuarios } from '../../api/servicios';
import { Cargando, MensajeError, Vacio } from '../../componentes/Estados';
import { useDatos } from '../../utilidades/useDatos';

/** Personal (GET /api/usuarios?tipo=personal): médicos y, solo para consulta, recepcionistas. */
export function Medicos() {
  const [buscar, setBuscar] = useState('');
  const [consulta, setConsulta] = useState('');
  const [pagina, setPagina] = useState(1);
  const { datos, error, cargando, recargar } = useDatos(() => usuarios.listar({ tipo: 'personal', buscar: consulta, estado: 'todos', pagina }), [consulta, pagina]);

  return (
    <section>
      <h1>Médicos y personal</h1>
      <form
        className="tarjeta fila"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setPagina(1);
          setConsulta(buscar.trim());
        }}
      >
        <label className="campo" style={{ flex: '1 1 220px' }}>
          <span>Buscar por nombre, DNI, correo o especialidad</span>
          <input value={buscar} maxLength={80} onChange={(e) => setBuscar(e.target.value)} />
        </label>
        <button type="submit" className="boton boton-secundario">
          Buscar
        </button>
      </form>

      {cargando && <Cargando />}
      {!cargando && error !== null && <MensajeError error={error} alReintentar={recargar} />}
      {!cargando && datos && datos.usuarios.length === 0 && <Vacio>No hay personal que coincida con la búsqueda.</Vacio>}
      {!cargando && datos && datos.usuarios.length > 0 && (
        <>
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Especialidad</th>
                <th>Matrícula</th>
                <th>Correo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {datos.usuarios.map((u) => (
                <tr key={u.id_usuario}>
                  <td data-etiqueta="Nombre">
                    {u.apellido}, {u.nombre}
                  </td>
                  <td data-etiqueta="Rol">{u.rol === 'medico' ? 'Médico' : 'Recepción'}</td>
                  <td data-etiqueta="Especialidad">{u.especialidad ?? '—'}</td>
                  <td data-etiqueta="Matrícula">{u.matricula ?? '—'}</td>
                  <td data-etiqueta="Correo">{u.email}</td>
                  <td data-etiqueta="Estado">
                    <span className={`etiqueta ${u.estado === 'activo' ? 'etiqueta-confirmado' : 'etiqueta-inactivo'}`}>{u.estado === 'activo' ? 'Activo' : 'Inactivo'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {datos.paginas > 1 && (
            <nav className="paginacion" aria-label="Páginas">
              <button type="button" className="boton boton-secundario boton-chico" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </button>
              <span>
                Página {datos.pagina} de {datos.paginas}
              </span>
              <button type="button" className="boton boton-secundario boton-chico" disabled={pagina >= datos.paginas} onClick={() => setPagina((p) => p + 1)}>
                Siguiente
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
