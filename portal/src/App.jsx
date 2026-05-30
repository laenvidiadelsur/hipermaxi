import React, { useState, useCallback } from 'react';
import { ConversationProvider, useConversation, useConversationClientTool } from '@elevenlabs/react';
import { Mic, MicOff, UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

function ProductForm() {
  const [formData, setFormData] = useState({
    descripcion: '',
    codigoBarra: '',
    precio: '',
    imagen: null
  });

  const [dragActive, setDragActive] = useState(false);
  const conversation = useConversation();

  // ----- ElevenLabs Client Tool Integration -----
  // This tool is called by the AI agent when the user needs help.
  useConversationClientTool("check_form_status", async () => {
    console.log("ElevenLabs AI is analyzing the form...");
    
    let camposVacios = [];
    if (!formData.descripcion) camposVacios.push("Descripción");
    if (!formData.codigoBarra) camposVacios.push("Código de Barra");
    if (!formData.precio) camposVacios.push("Precio");

    let errorImagen = null;
    if (formData.imagen && formData.imagen.type === "application/pdf") {
      errorImagen = "Formato inválido. Debe ser JPG o PNG.";
    } else if (!formData.imagen) {
      errorImagen = "No se ha subido ninguna imagen.";
    }

    // Return the exact state to the Agent
    return {
      campos_incompletos: camposVacios,
      error_imagen: errorImagen,
      puede_guardar: camposVacios.length === 0 && !errorImagen
    };
  });
  // ----------------------------------------------

  const handleCallSupport = useCallback(async () => {
    try {
      if (conversation.status === 'connected') {
        await conversation.endSession();
      } else {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        await conversation.startSession({
          agentId: 'agent_4801ksx0pvn6fz2sn7a7ejxp8dn3'
        });
      }
    } catch (error) {
      console.error('Failed to start session:', error);
      toast.error('No se pudo acceder al micrófono o conectar con la IA.');
    }
  }, [conversation]);

  const handleFile = (file) => {
    if (file) {
      setFormData(prev => ({ ...prev, imagen: file }));
      if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
        toast.error('¡Formato no válido! Por favor sube JPG o PNG.', {
          icon: <AlertCircle className="text-red-500" />
        });
      } else {
        toast.success('Imagen cargada correctamente.', {
          icon: <CheckCircle2 className="text-green-500" />
        });
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { descripcion, codigoBarra, precio, imagen } = formData;
    
    if (!descripcion || !codigoBarra || !precio) {
      toast.error('Por favor completa todos los campos obligatorios.');
      return;
    }
    
    if (!imagen || (imagen.type !== 'image/jpeg' && imagen.type !== 'image/png')) {
      toast.error('Falta la imagen o el formato es incorrecto (Solo JPG/PNG).');
      return;
    }

    toast.success('¡Producto registrado con éxito!', {
      style: { background: '#10b981', color: '#fff' },
      iconTheme: { primary: '#fff', secondary: '#10b981' },
    });
  };

  return (
    <div className="app-container">
      {/* Formulario Principal */}
      <div className="glass-card">
        <div className="header">
          <h1>Registro de Nuevo Producto</h1>
          <p>Portal Web de Proveedores - Hipermaxi</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Descripción del Producto *</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Ej. Galletas de Chocolate 500g"
              value={formData.descripcion}
              onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Código de Barra *</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Ej. 7701234567890"
              value={formData.codigoBarra}
              onChange={(e) => setFormData({...formData, codigoBarra: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Precio Unitario (Bs) *</label>
            <input 
              type="number" 
              step="0.01"
              className="form-input" 
              placeholder="0.00"
              value={formData.precio}
              onChange={(e) => setFormData({...formData, precio: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Imagen del Producto (JPG/PNG) *</label>
            <div 
              className="file-upload"
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              style={{ borderColor: dragActive ? 'var(--primary)' : '' }}
              onClick={() => document.getElementById('file-upload-input').click()}
            >
              <UploadCloud size={48} color="var(--primary)" style={{ opacity: 0.7, marginBottom: '1rem' }} />
              <p>{formData.imagen ? formData.imagen.name : 'Arrastra tu archivo aquí o haz clic para subir'}</p>
              <input 
                id="file-upload-input"
                type="file" 
                accept=".jpg,.jpeg,.png,.pdf" 
                style={{ display: 'none' }} 
                onChange={handleChange}
              />
            </div>
          </div>

          <button type="submit" className="btn-submit">
            Guardar Producto
          </button>
        </form>
      </div>

      {/* AI Assistant Panel */}
      <div className="glass-card ai-panel">
        <div className="ai-content">
          <div className={`ai-avatar ${conversation.status === 'connected' ? 'active' : ''}`}>
            <AlertCircle size={48} />
          </div>
          
          <div className="ai-status">
            {conversation.status === 'connected' ? 'Conectado a Soporte AI' : 'Soporte Nivel 0'}
          </div>
          
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>¿No puedes guardar?</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
            Habla con nuestro asistente virtual. Él puede ver qué te falta llenar en el formulario al instante.
          </p>

          <button 
            className={`btn-call ${conversation.status === 'connected' ? 'connected' : ''}`}
            onClick={handleCallSupport}
            disabled={conversation.status === 'connecting'}
          >
            {conversation.status === 'connected' ? (
              <><MicOff size={20} /> Colgar Llamada</>
            ) : (
              <><Mic size={20} /> Llamar a Soporte (AI)</>
            )}
          </button>

          {conversation.status === 'connected' && (
            <div className="volume-indicator">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bar" style={{ animationDelay: `${Math.random() * 0.5}s` }}></div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ConversationProvider>
      <Toaster position="top-right" />
      <ProductForm />
    </ConversationProvider>
  );
}
