import React, { useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Home from './pages/Home';
import ProductForm from './pages/ProductForm';

export default function App() {
  const navigate = useNavigate();

  // Escuchamos el evento de ElevenLabs globalmente para poder redirigir desde cualquier pantalla
  useEffect(() => {
    const handleGlobalCall = (event) => {
      console.log("ElevenLabs AI inició llamada. Registrando Client Tools Globales...");
      
      // Asegurarnos de que el objeto clientTools existe
      if (!event.detail.config.clientTools) {
        event.detail.config.clientTools = {};
      }
      
      // Inyectamos la herramienta global de navegación
      event.detail.config.clientTools.redirigir_pagina = async ({ ruta }) => {
        console.log(`ElevenLabs AI ha solicitado navegar a: ${ruta}`);
        
        // Hacemos la redirección de React Router
        if (ruta) {
          navigate(ruta);
        }
        
        return {
          exito: true,
          mensaje: `Navegación completada a ${ruta}`
        };
      };
    };

    const attachGlobalListener = setInterval(() => {
      const widget = document.querySelector('elevenlabs-convai');
      if (widget) {
        widget.addEventListener('elevenlabs-convai:call', handleGlobalCall);
        clearInterval(attachGlobalListener);
      }
    }, 500);

    return () => {
      clearInterval(attachGlobalListener);
      const widget = document.querySelector('elevenlabs-convai');
      if (widget) widget.removeEventListener('elevenlabs-convai:call', handleGlobalCall);
    };
  }, [navigate]);

  return (
    <>
      <Toaster position="top-right" />
      
      {/* Widget Flotante de ElevenLabs Global */}
      <elevenlabs-convai agent-id="agent_4801ksx0pvn6fz2sn7a7ejxp8dn3"></elevenlabs-convai>

      <div className="app-container" style={{ gridTemplateColumns: '1fr', maxWidth: '900px' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/crear-producto" element={<ProductForm />} />
        </Routes>
      </div>
    </>
  );
}
