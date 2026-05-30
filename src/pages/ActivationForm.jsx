import React, { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import toast from 'react-hot-toast';

const STEPS = [
  { id: 'SUBMISSION', label: 'Petición de Información', number: '1' },
  { id: 'APPROVAL', label: 'Revisión (Aprobación)', number: '2' },
  { id: 'FULFILLMENT', label: 'Aprobado', number: '3' },
  { id: 'CLOSURE', label: 'Código Asignado', icon: <FileText size={14} /> }
];

export default function ActivationForm() {
  const [formData, setFormData] = useState({
    nombreProveedor: '',
    razonSocial: '',
    nit: '',
    rol: 'Encargado de Sistemas',
    email: '',
    telefono: '',
    codigoProveedor: '',
    region: 'Santa Cruz'
  });

  const [currentStatus, setCurrentStatus] = useState(null);
  const [requestId, setRequestId] = useState(localStorage.getItem('activationRequestId') || null);

  useEffect(() => {
    if (requestId) {
      fetchStatus();
    }
  }, [requestId]);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/activations/${requestId}`);
      if (!res.ok) throw new Error('API Not Found');
      const data = await res.json();
      setCurrentStatus(data.status);
    } catch (e) {
      console.warn('Fallback a LocalStorage para leer estado', e);
      const mockDB = JSON.parse(localStorage.getItem('mockActivationsDB') || '[]');
      const req = mockDB.find(r => r.id === requestId);
      if (req) {
        setCurrentStatus(req.status);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/activations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) throw new Error('API no disponible');
      
      const data = await res.json();
      
      setRequestId(data.id);
      setCurrentStatus(data.status);
      localStorage.setItem('activationRequestId', data.id);
      
      toast.success('Solicitud enviada correctamente');
    } catch (e) {
      // FALLBACK MOCK: Si el backend de Vercel no está levantado, simular el avance para probar el UI.
      console.warn('Usando Mock Backend porque la API falló:', e);
      const fakeId = `req_${Date.now()}`;
      setRequestId(fakeId);
      setCurrentStatus('SUBMISSION');
      localStorage.setItem('activationRequestId', fakeId);
      
      // Guardar también globalmente para que el Back Office pueda leerlo temporalmente
      const mockDB = JSON.parse(localStorage.getItem('mockActivationsDB') || '[]');
      mockDB.push({
        id: fakeId,
        providerData: formData,
        status: 'SUBMISSION',
        createdAt: new Date().toISOString()
      });
      localStorage.setItem('mockActivationsDB', JSON.stringify(mockDB));

      toast.success('Solicitud Simulada (Modo Prueba)');
    }
  };

  const getStepIndex = (status) => {
    if (!status) return 0; // Si no hay estado, estamos en el paso 1 llenando el form
    return STEPS.findIndex(s => s.id === status);
  };

  const activeIndex = getStepIndex(currentStatus);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem', fontFamily: 'sans-serif' }}>
      
      {/* UNITY STYLE STEPPER */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '3rem', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '600px', position: 'relative' }}>
          
          {/* Línea de conexión */}
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '40px',
            right: '40px',
            height: '1px',
            background: '#d1d5db', // gray-300
            zIndex: 0
          }}></div>

          {STEPS.map((step, index) => {
            const isActive = index <= activeIndex;
            return (
              <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, width: '120px' }}>
                <div style={{
                  width: '24px', 
                  height: '24px', 
                  borderRadius: '50%',
                  background: isActive ? '#000' : '#fff',
                  border: `1px solid ${isActive ? '#000' : '#d1d5db'}`,
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  color: isActive ? '#fff' : '#6b7280',
                  fontSize: '12px',
                  fontWeight: '600',
                  marginBottom: '8px'
                }}>
                  {step.icon ? step.icon : step.number}
                </div>
                <span style={{ 
                  fontSize: '11px', 
                  textAlign: 'center',
                  fontWeight: isActive ? '600' : '400',
                  color: '#000'
                }}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '2rem' }}>
        
        {/* MAIN CONTENT AREA */}
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
            {currentStatus ? 'Estado de tu Solicitud' : 'Petición de Información'}
          </h2>

          {!currentStatus ? (
            <form onSubmit={handleSubmit} style={{ background: '#fff', padding: '0', borderRadius: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>Nombre del Proveedor</label>
                  <input type="text" style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '4px' }} 
                    value={formData.nombreProveedor} onChange={e => setFormData({...formData, nombreProveedor: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>Razón Social</label>
                  <input type="text" style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '4px' }} 
                    value={formData.razonSocial} onChange={e => setFormData({...formData, razonSocial: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>NIT</label>
                  <input type="text" style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '4px' }} 
                    value={formData.nit} onChange={e => setFormData({...formData, nit: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>Email</label>
                  <input type="email" style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '4px' }} 
                    value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>Teléfono</label>
                  <input type="text" style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '4px' }} 
                    value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>Código Proveedor (Catálogo)</label>
                  <input type="text" style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '4px' }} 
                    value={formData.codigoProveedor} onChange={e => setFormData({...formData, codigoProveedor: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>Rol *</label>
                  <select style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '4px' }} value={formData.rol} onChange={e => setFormData({...formData, rol: e.target.value})}>
                    <option>Encargado de Sistemas</option>
                    <option>Encargado HUB</option>
                    <option>Encargado de Área Comercial/Ventas</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>Región *</label>
                  <select style={{ padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '4px' }} value={formData.region} onChange={e => setFormData({...formData, region: e.target.value})}>
                    <option>Santa Cruz</option>
                    <option>La Paz</option>
                    <option>Cochabamba</option>
                  </select>
                </div>
              </div>
              <button type="submit" style={{ background: '#3b82f6', color: 'white', padding: '0.75rem 2rem', borderRadius: '4px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
                Next step
              </button>
            </form>
          ) : (
            <div style={{ padding: '2rem', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#f9fafb' }}>
              <h3 style={{ marginBottom: '1rem' }}>Tu solicitud está en proceso</h3>
              <p style={{ color: '#4b5563', marginBottom: '2rem' }}>
                El ID de tu solicitud es: <strong>{requestId}</strong>. <br/>
                Actualmente se encuentra en la etapa: <strong>{STEPS[activeIndex].label}</strong>.
              </p>
              <button onClick={fetchStatus} style={{ background: '#000', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '4px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
                Actualizar Estado
              </button>
            </div>
          )}
        </div>
        
        {/* RIGHT SIDEBAR SIMULATION (Like Unity summary) */}
        {!currentStatus && (
          <div style={{ width: '300px' }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '4px', background: '#fff' }}>
              <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', fontWeight: 'bold' }}>
                Resumen de Solicitud
              </div>
              <div style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                  <span>Soporte a Proveedores</span>
                  <span style={{ color: '#16a34a', fontWeight: 'bold' }}>Gratis</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#6b7280', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem', marginBottom: '1rem' }}>
                  <span>Activación de Catálogo</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem' }}>
                  <span>Costo total:</span>
                  <span style={{ color: '#16a34a' }}>$0.00</span>
                </div>

                <div style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '4px', fontSize: '0.8rem', color: '#4b5563', marginBottom: '1rem' }}>
                  <strong>Compromiso</strong><br/>
                  Al enviar esta solicitud aceptas el acuerdo comercial de Hipermaxi S.A.
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
