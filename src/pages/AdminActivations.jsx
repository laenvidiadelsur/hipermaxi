import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck, Clock, Flag } from 'lucide-react';

export default function AdminActivations() {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const res = await fetch('/api/activations');
      if (!res.ok) throw new Error('API down');
      const data = await res.json();
      setRequests(data);
    } catch (e) {
      console.warn('Fallback a LocalStorage para lista de requests');
      const mockDB = JSON.parse(localStorage.getItem('mockActivationsDB') || '[]');
      setRequests(mockDB);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      const res = await fetch(`/api/activations/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      
      if (!res.ok) throw new Error('API down');
      
      toast.success(`Estado actualizado a ${status}`);
      fetchRequests();
    } catch (e) {
      console.warn('Fallback a LocalStorage para update de status');
      const mockDB = JSON.parse(localStorage.getItem('mockActivationsDB') || '[]');
      const reqIndex = mockDB.findIndex(r => r.id === id);
      if (reqIndex !== -1) {
        mockDB[reqIndex].status = status;
        localStorage.setItem('mockActivationsDB', JSON.stringify(mockDB));
        toast.success(`Estado actualizado a ${status} (Modo Prueba)`);
        fetchRequests();
      } else {
        toast.error('Error al actualizar estado');
      }
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'SUBMISSION': return <span style={{ background: '#fef08a', color: '#854d0e', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>Petición Info</span>;
      case 'APPROVAL': return <span style={{ background: '#bfdbfe', color: '#1e40af', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>En Revisión</span>;
      case 'FULFILLMENT': return <span style={{ background: '#fbcfe8', color: '#9d174d', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>Aprobado</span>;
      case 'CLOSURE': return <span style={{ background: '#bbf7d0', color: '#166534', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>Código Generado</span>;
      default: return status;
    }
  };

  return (
    <div className="glass-card" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div className="header">
        <h1>Back Office: Gestión de Activaciones</h1>
        <p>Área de Compras y Soporte a Proveedores</p>
      </div>

      <div style={{ overflowX: 'auto', marginTop: '2rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
              <th style={{ padding: '1rem' }}>ID Solicitud</th>
              <th style={{ padding: '1rem' }}>Proveedor / NIT</th>
              <th style={{ padding: '1rem' }}>Cód. Catálogo</th>
              <th style={{ padding: '1rem' }}>Estado Actual</th>
              <th style={{ padding: '1rem' }}>Acciones (ITIL)</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(req => (
              <tr key={req.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <td style={{ padding: '1rem' }}>
                  <strong>{req.id}</strong><br/>
                  <small style={{ color: 'gray' }}>{new Date(req.createdAt).toLocaleString()}</small>
                </td>
                <td style={{ padding: '1rem' }}>
                  {req.providerData.razonSocial}<br/>
                  <small style={{ color: 'gray' }}>NIT: {req.providerData.nit}</small>
                </td>
                <td style={{ padding: '1rem' }}>{req.providerData.codigoProveedor}</td>
                <td style={{ padding: '1rem' }}>{getStatusBadge(req.status)}</td>
                <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                  {req.status === 'SUBMISSION' && (
                    <button 
                      onClick={() => updateStatus(req.id, 'APPROVAL')}
                      style={{ background: '#3b82f6', color: 'white', padding: '0.5rem', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                      title="Solicitar Revisión"
                    >
                      <ShieldCheck size={18} />
                    </button>
                  )}
                  {req.status === 'APPROVAL' && (
                    <button 
                      onClick={() => updateStatus(req.id, 'FULFILLMENT')}
                      style={{ background: '#db2777', color: 'white', padding: '0.5rem', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                      title="Aprobar"
                    >
                      <ShieldCheck size={18} />
                    </button>
                  )}
                  {req.status === 'FULFILLMENT' && (
                    <button 
                      onClick={() => updateStatus(req.id, 'CLOSURE')}
                      style={{ background: '#22c55e', color: 'white', padding: '0.5rem', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                      title="Enviar Código Proveedor"
                    >
                      <Flag size={18} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'gray' }}>
                  No hay solicitudes de activación pendientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
