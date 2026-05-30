import React, { useState, useEffect, useRef } from 'react';
import { UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProductForm() {
  const [formData, setFormData] = useState({
    descripcion: '',
    codigoBarra: '',
    precio: '',
    imagen: null
  });

  const [dragActive, setDragActive] = useState(false);
  const [formErrors, setFormErrors] = useState([]);
  
  // Referencia para la herramienta check_form_status
  const formDataRef = useRef(formData);
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Registramos la herramienta check_form_status específica de esta página
  useEffect(() => {
    const handleCheckForm = (event) => {
      // Solo agregamos la herramienta si el evento nos lo permite
      if (!event.detail.config.clientTools) {
        event.detail.config.clientTools = {};
      }
      
      event.detail.config.clientTools.check_form_status = async () => {
        console.log("ElevenLabs AI está analizando el formulario...");
        const currentData = formDataRef.current;
        
        let camposVacios = [];
        if (!currentData.descripcion) camposVacios.push("Descripción");
        if (!currentData.codigoBarra) camposVacios.push("Código de Barra");
        if (!currentData.precio) camposVacios.push("Precio");

        let errorImagen = null;
        if (currentData.imagen && currentData.imagen.type === "application/pdf") {
          errorImagen = "Formato inválido. Debe ser JPG o PNG.";
          camposVacios.push("Imagen");
        } else if (!currentData.imagen) {
          errorImagen = "No se ha subido ninguna imagen.";
          camposVacios.push("Imagen");
        }

        setFormErrors(camposVacios);

        return {
          campos_incompletos: camposVacios,
          error_imagen: errorImagen,
          puede_guardar: camposVacios.length === 0 && !errorImagen
        };
      };
    };

    const attachListener = setInterval(() => {
      const widget = document.querySelector('elevenlabs-convai');
      if (widget) {
        widget.addEventListener('elevenlabs-convai:call', handleCheckForm);
        clearInterval(attachListener);
      }
    }, 500);

    return () => {
      clearInterval(attachListener);
      const widget = document.querySelector('elevenlabs-convai');
      if (widget) widget.removeEventListener('elevenlabs-convai:call', handleCheckForm);
    };
  }, []);

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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
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
    <div className="glass-card" style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div className="header">
        <h1>Registro de Nuevo Producto</h1>
        <p>Portal Web de Proveedores - Hipermaxi</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Descripción del Producto *</label>
          <input 
            type="text" 
            className={`form-input ${formErrors.includes("Descripción") ? "error-highlight" : ""}`}
            placeholder="Ej. Galletas de Chocolate 500g"
            value={formData.descripcion}
            onChange={(e) => {
              setFormData({...formData, descripcion: e.target.value});
              setFormErrors(prev => prev.filter(err => err !== "Descripción"));
            }}
          />
        </div>

        <div className="form-group">
          <label>Código de Barra *</label>
          <input 
            type="text" 
            className={`form-input ${formErrors.includes("Código de Barra") ? "error-highlight" : ""}`}
            placeholder="Ej. 7701234567890"
            value={formData.codigoBarra}
            onChange={(e) => {
              setFormData({...formData, codigoBarra: e.target.value});
              setFormErrors(prev => prev.filter(err => err !== "Código de Barra"));
            }}
          />
        </div>

        <div className="form-group">
          <label>Precio Unitario (Bs) *</label>
          <input 
            type="number" 
            step="0.01"
            className={`form-input ${formErrors.includes("Precio") ? "error-highlight" : ""}`}
            placeholder="0.00"
            value={formData.precio}
            onChange={(e) => {
              setFormData({...formData, precio: e.target.value});
              setFormErrors(prev => prev.filter(err => err !== "Precio"));
            }}
          />
        </div>

        <div className="form-group">
          <label>Imagen del Producto (JPG/PNG) *</label>
          <div 
            className={`file-upload ${formErrors.includes("Imagen") ? "error-highlight" : ""}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            style={{ borderColor: dragActive ? 'var(--primary)' : '' }}
            onClick={() => document.getElementById('file-upload-input').click()}
          >
            <UploadCloud size={48} color={formErrors.includes("Imagen") ? "var(--danger)" : "var(--primary)"} style={{ opacity: 0.7, marginBottom: '1rem' }} />
            <p>{formData.imagen ? formData.imagen.name : 'Arrastra tu archivo aquí o haz clic para subir'}</p>
            <input 
              id="file-upload-input"
              type="file" 
              accept=".jpg,.jpeg,.png,.pdf" 
              style={{ display: 'none' }} 
              onChange={(e) => {
                handleChange(e);
                setFormErrors(prev => prev.filter(err => err !== "Imagen"));
              }}
            />
          </div>
        </div>

        <button type="submit" className="btn-submit">
          Guardar Producto
        </button>
      </form>
    </div>
  );
}
