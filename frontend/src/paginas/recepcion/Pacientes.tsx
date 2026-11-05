import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usuarios } from '../../api/servicios';
import { Cargando, MensajeError, Vacio } from '../../componentes/Estados';
import { textoDeBusqueda } from '../../utilidades/busqueda';
import { useDatos } from '../../utilidades/useDatos';

/**
 * Pacientes registrados (GET /api/usuarios?tipo=pacientes), con búsqueda por DNI, nombre o correo,
 * filtro de estado y páginas de 10. Recepción no crea pacientes: cada paciente crea su cuenta en la
 * pantalla de registro. Desde acá se elige al paciente para registrarle un turno.
 */
export function Pacientes() {
  const [buscar, setBuscar] = useState('');
  const [consulta, setConsulta] = useState('');
  const [estado, setEstado] = useState<'todos' | 'activo' | 'inactivo'>('activo');
  const [pagina, setPagina] = useState(1);
  const { datos, error, cargando, recargar } = useDatos(() => usuarios.listar({ tipo: 'pacientes', buscar: consulta, estado, pagina }), [consulta, estado, pagina]);

  return (
    <section>
      <h1>Pacientes</h1>
      <p className="secundario">Los pacientes crean su cuenta desde la pantalla de registro. Buscalos por su DNI para registrarles un turno.</p>

      <form
        className="tarjeta fila"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setPagina(1);
          setConsulta(textoDeBusqueda(buscar));
        }}
      >
        <label className="campo" style={{ flex: '1 1 220px' }}>
          <span>Buscar por DNI, nombre o correo</span>
          <input value={buscar} maxLength={80} placeholder="Ej. 38123456" onChange={(e) => setBuscar(e.target.value)} />
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
      {!cargando && datos && datos.usuarios.length === 0 && (
        <Vacio>{consulta ? 'No se encontró ningún paciente registrado con esos datos.' : 'Todavía no hay pacientes registrados.'}</Vacio>
      )}
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
                <th>Acciones</th>
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
                  <td data-etiqueta="Acciones">
                    {/* Solo los pacientes activos pueden tener turnos nuevos (GET /api/pacientes lista solo activos) */}
                    {u.estado === 'activo' && (
                      <Link
                        to={`/recepcion/turnos/nuevo?dni=${encodeURIComponent(u.dni)}`}
                        className="boton boton-secundario boton-chico"
                        aria-label={`Registrar turno para ${u.nombre} ${u.apellido}`}
                      >
                        Registrar turno
                      </Link>
                    )}
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
