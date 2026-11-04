import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usuarios } from '../../api/servicios';
import { Aviso, Cargando, MensajeError, Vacio } from '../../componentes/Estados';
import { useDatos } from '../../utilidades/useDatos';

/** Pacientes registrados (GET /api/usuarios?tipo=pacientes), con búsqueda, filtro de estado y páginas de 10. */
export function Pacientes() {
  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso;
  const [buscar, setBuscar] = useState('');
  const [consulta, setConsulta] = useState('');
  const [estado, setEstado] = useState<'todos' | 'activo' | 'inactivo'>('activo');
  const [pagina, setPagina] = useState(1);
  const { datos, error, cargando, recargar } = useDatos(() => usuarios.listar({ tipo: 'pacientes', buscar: consulta, estado, pagina }), [consulta, estado, pagina]);

  return (
    <section>
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h1>Pacientes</h1>
        <Link to="/recepcion/pacientes/nuevo" className="boton boton-primario">
          Nuevo paciente
        </Link>
      </div>
      {aviso && <Aviso>{aviso}</Aviso>}

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
          <span>Buscar por nombre, DNI o correo</span>
          <input value={buscar} maxLength={80} onChange={(e) => setBuscar(e.target.value)} />
        </label>
        <label className="campo">
          <span>Estado</span>
          <select
            value={estado}
            onChange={(e) => {
              setPagina(1);
              setEstado(e.target.value as typeof estado);
            }}
          >
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <button type="submit" className="boton boton-secundario">
          Buscar
        </button>
      </form>

      {cargando && <Cargando />}
      {!cargando && error !== null && <MensajeError error={error} alReintentar={recargar} />}
      {!cargando && datos && datos.usuarios.length === 0 && <Vacio>No hay pacientes que coincidan con la búsqueda.</Vacio>}
      {!cargando && datos && datos.usuarios.length > 0 && (
        <>
          <p className="secundario">{datos.total} paciente(s)</p>
          <table className="tabla">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>DNI</th>
                <th>Correo</th>
                <th>Teléfono</th>
                <th>Obra social</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {datos.usuarios.map((u) => (
                <tr key={u.id_usuario}>
                  <td data-etiqueta="Paciente">
                    {u.apellido}, {u.nombre}
                  </td>
                  <td data-etiqueta="DNI">{u.dni}</td>
                  <td data-etiqueta="Correo">{u.email}</td>
                  <td data-etiqueta="Teléfono">{u.telefono ?? '—'}</td>
                  <td data-etiqueta="Obra social">{u.obra_social ?? '—'}</td>
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
