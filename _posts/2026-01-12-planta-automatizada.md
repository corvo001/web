---
layout: single
title: "Sistema automatizado de producción con robots coordinados"
excerpt: "Simulación, control y supervisión de una línea de producción robotizada."
date: 2025-08-11
show_on_home: false
categories:
  - Proyectos
tags:
  - automatización industrial
  - robótica
  - control
  - IT-OT
  - simulación
---
## Características principales

 - Modelo de planta industrial simulada con estaciones, robots y flujos de material.
 - Lógica de control secuencial tipo PLC, basada en máquinas de estados e interlocks.
 - Coordinación multi-robot sin colisiones ni bloqueos.
 - Gestión de estados operativos (idle, run, stop, fault).
 - Manejo de alarmas, fallos y rearme seguro.
 - Supervisión HMI / SCADA ligero para operación y diagnóstico.
 - Registro de eventos y métricas básicas de producción.

## Enfoque técnico

El diseño del sistema sigue criterios habituales de automatización industrial:
 - Control determinista y reproducible.
 - Separación entre lógica de control y visualización.
 - Sincronización explícita entre estaciones.
 - Arquitectura modular y escalable.

No se emplean técnicas opacas ni heurísticas no verificables; el proyecto prioriza control clásico, trazabilidad y claridad funcional, alineándose con prácticas industriales reales.

## Integración IT–OT

Además del control, el proyecto incorpora prácticas propias del mundo IT aplicadas a entornos productivos:
 - Versionado del sistema de control.
 - Configuración reproducible de la planta simulada.
 - Logs de eventos y trazabilidad del proceso.
 - Estructura orientada a evolución hacia hardware real o PLCs industriales.

Este enfoque permite explorar de forma práctica la convergencia entre software moderno y automatización industrial.

## Estado del proyecto
Proyecto en desarrollo.
La implementación comienza con una célula básica y evoluciona progresivamente hacia una línea de producción más compleja y completa.
Este trabajo forma parte de mi enfoque en automatización industrial, robótica y perfiles híbridos IT-OT, complementando proyectos previos de simulación y desarrollo software.
## Repositorio

Puedes consultar el código completo en [GitHub](https://github.com/corvo001/UNION).

