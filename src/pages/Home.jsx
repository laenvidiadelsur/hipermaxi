import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PackagePlus, LayoutDashboard } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="glass-card" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
      <div className="header">
        <h1 style={{ fontSize: '2.5rem' }}>Bienvenido al Portal de Proveedores</h1>
        <p style={{ fontSize: '1.1rem', marginTop: '1rem' }}>
          Gestiona tu catálogo, ventas y envíos de manera sencilla e intuitiva.
        </p>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '3rem' }}>
        
        <div 
          onClick={() => navigate('/crear-producto')}
          style={{ 
            padding: '2rem', background: 'rgba(255,255,255,0.6)', 
            borderRadius: '16px', cursor: 'pointer',
            transition: 'transform 0.2s', border: '1px solid rgba(0,0,0,0.1)'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <PackagePlus size={48} color="var(--primary)" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Registrar Producto</h3>
          <p style={{ color: 'var(--text-muted)' }}>Añade nuevos productos a tu catálogo de ventas.</p>
        </div>

        <div 
          onClick={() => navigate('/activacion-codigo')}
          style={{ 
            padding: '2rem', background: 'rgba(255,255,255,0.6)', 
            borderRadius: '16px', cursor: 'pointer',
            transition: 'transform 0.2s', border: '1px solid rgba(0,0,0,0.1)'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <LayoutDashboard size={48} color="#2563eb" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Activar Código Proveedor</h3>
          <p style={{ color: 'var(--text-muted)' }}>Solicita y haz seguimiento a la activación de tu catálogo.</p>
        </div>

        <div 
          onClick={() => navigate('/admin/activaciones')}
          style={{ 
            padding: '2rem', background: 'rgba(255,255,255,0.6)', 
            borderRadius: '16px', cursor: 'pointer',
            transition: 'transform 0.2s', border: '1px solid rgba(0,0,0,0.1)'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <LayoutDashboard size={48} color="#db2777" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Back Office (Admin)</h3>
          <p style={{ color: 'var(--text-muted)' }}>Solo Compras y Soporte: Gestiona las solicitudes ITIL.</p>
        </div>

      </div>

      <div style={{ marginTop: '3rem', padding: '1rem', background: 'rgba(79, 70, 229, 0.1)', borderRadius: '12px' }}>
        <p style={{ fontWeight: 600, color: 'var(--primary)' }}>
          💡 Tip: ¡Puedes hablar con nuestro asistente inteligente! 
          Haz clic en la burbuja de la esquina y dile: "Quiero crear un producto".
        </p>
      </div>
    </div>
  );
}
