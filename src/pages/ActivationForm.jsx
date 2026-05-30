import React, { useState, useEffect } from 'react';
import { Send, CheckCircle, Clock, CheckCircle2, ShieldCheck, Flag } from 'lucide-react';
import toast from 'react-hot-toast';

const STEPS = [
  { id: 'SUBMISSION', label: 'Enviado', icon: <Send size={20} /> },
  { id: 'APPROVAL', label: 'Aprobación (Compras)', icon: <ShieldCheck size={20} /> },
  { id: 'FULFILLMENT', label: 'Cumplimiento (Soporte)', icon: <Clock size={20} /> },
  { id: 'CLOSURE', label: 'Cierre', icon: <Flag size={20} /> }
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

  const [currentStatus, setCurrentStatus] = useState(null); // null significa que aún no ha enviado
  const [requestId, setRequestId] = useState(localStorage.getItem('activationRequestId') || null);

  useEffect(() => {
    // Si ya existe un request, consultar el estado al backend
    if (requestId) {
      fetchStatus();
    }
  }, [requestId]);

  const fetchStatus = async () => {
    try {
      // En desarrollo usamos el proxy o ruta directa. Para Vercel será /api/...
      const res = await fetch(`/api/activations/${requestId}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentStatus(data.status);
      }
    } catch (e) {
      console.error('Error fetching status', e);
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
      const data = await res.json();
      
      setRequestId(data.id);
      setCurrentStatus(data.status);
      localStorage.setItem('activationRequestId', data.id);
      
      toast.success('Solicitud enviada correctamente');
    } catch (e) {
      toast.error('Error al enviar solicitud');
    }
  };

  const getStepIndex = (status) => {
    return STEPS.findIndex(s => s.id === status);
  };

  const activeIndex = getStepIndex(currentStatus);

  return (
    <div className="app-container" style={{ gridTemplateColumns: '1fr', maxWidth: '800px', margin: '0 auto' }}>
      
      {/* Progress Stepper Visual */}
      {currentStatus && (
        <div className="glass-card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Estado de tu Solicitud</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            
            {/* Línea de conexión de fondo */}
            <div style={{
              position: 'absolute', top: '24px', left: '10%', right: '10%',
              height: '4px', background: 'rgba(0,0,0,0.1)', zIndex: 0
            }}></div>

            {/* Línea de progreso */}
            <div style={{
              position: 'absolute', top: '24px', left: '10%', 
              width: `${(Math.max(activeIndex, 0) / (STEPS.length - 1)) * 80}%`,
              height: '4px', background: 'var(--primary)', zIndex: 0, transition: 'width 0.5s ease'
            }}></div>

            {STEPS.map((step, index) => {
              const isActive = index <= activeIndex;
              return (
                <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, width: '25%' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    background: isActive ? 'var(--primary)' : 'white',
                    border: `4px solid ${isActive ? 'var(--primary)' : 'rgba(0,0,0,0.1)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isActive ? 'white' : 'gray',
                    transition: 'all 0.3s ease',
                    boxShadow: isActive ? '0 0 15px rgba(79, 70, 229, 0.4)' : 'none'
                  }}>
                    {isActive && index < activeIndex ? <CheckCircle2 size={24} /> : step.icon}
                  </div>
                  <span style={{ 
                    marginTop: '0.8rem', fontSize: '0.9rem', textAlign: 'center',
                    fontWeight: isActive ? '600' : '400',
                    color: isActive ? 'var(--text)' : 'var(--text-muted)'
                  }}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
          
          <div style={{ marginTop: '2rem', textAlign: 'center' }}>
            <button onClick={fetchStatus} className="btn-submit" style={{ padding: '0.5rem 1rem', width: 'auto' }}>
              Actualizar Estado
            </button>
          </div>
        </div>
      )}

      {/* Formulario */}
      {!currentStatus && (
        <div className="glass-card">
          <div className="header">
            <h1>Solicitud de Activación de Código (Catálogo)</h1>
            <p>Procedimiento SOP-SR-02</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Nombre del Proveedor *</label>
                <input required type="text" className="form-input" 
                  value={formData.nombreProveedor} onChange={e => setFormData({...formData, nombreProveedor: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Razón Social *</label>
                <input required type="text" className="form-input" 
                  value={formData.razonSocial} onChange={e => setFormData({...formData, razonSocial: e.target.value})} />
              </div>
              <div className="form-group">
                <label>NIT *</label>
                <input required type="text" className="form-input" 
                  value={formData.nit} onChange={e => setFormData({...formData, nit: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input required type="email" className="form-input" 
                  value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Teléfono *</label>
                <input required type="text" className="form-input" 
                  value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Código Proveedor (Catálogo) *</label>
                <input required type="text" className="form-input" 
                  value={formData.codigoProveedor} onChange={e => setFormData({...formData, codigoProveedor: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Rol *</label>
                <select className="form-input" value={formData.rol} onChange={e => setFormData({...formData, rol: e.target.value})}>
                  <option>Encargado de Sistemas</option>
                  <option>Encargado HUB</option>
                  <option>Encargado de Área Comercial/Ventas</option>
                </select>
              </div>
              <div className="form-group">
                <label>Región *</label>
                <select className="form-input" value={formData.region} onChange={e => setFormData({...formData, region: e.target.value})}>
                  <option>Santa Cruz</option>
                  <option>La Paz</option>
                  <option>Cochabamba</option>
                </select>
              </div>
            </div>

            <button type="submit" className="btn-submit" style={{ marginTop: '1.5rem' }}>
              Enviar Solicitud
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
