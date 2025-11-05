---
layout: single
title: "Aerodeslizador"
excerpt: "Simulación, diseño de control y prototipo experimental de aerodeslizador."
date: 2025-10-20
show_on_home: true
categories:
  - Proyectos
tags:
  - control
  - simulación
  - experimentación
  - software
---

Laboratorio completo para el **diseño, simulación y control** de aerodeslizadores (hovercraft). El objetivo es disponer de una plataforma funcional que permita:

1. **Diseñar controladores de velocidad y rumbo** con criterios de ingeniería.
2. **Validar hipótesis físicas** antes de fabricar prototipos costosos.
3. **Explorar límites de estabilidad** bajo condiciones realistas de viento y fricción.

Este trabajo combina **software, hardware y modelado físico**, y se plantea como paso previo hacia un futuro **aerodeslizador gravitacional** (en desarrollo dentro de mi investigación teórica avanzada).

---

## Objetivos

- Implementar un **modelo dinámico 2D** verificable.
- Desarrollar **controladores PID** con seguimiento de waypoints.
- Construir y probar **prototipo real funcional**.
- Evaluar **trade-offs** entre potencia, sustentación y estabilidad.
- Establecer una metodología que conecte hovercraft → maglev → control gravitacional.

---

## Motor de simulación

Características técnicas:

- Ecuaciones de cuerpo rígido en 2D
- Sustentación modelada con **lift limitado** + **amortiguamiento extra** si no se iguala el peso
- **Viento lateral**, rozamiento y saturación de actuadores
- Gráficos automáticos de:
  - trayectoria
  - velocidades
  - entradas de control
  - margen de sustentación (Lift vs Peso)

Ejecución rápida:

```bash
python run_sim.py
```

Genera:
- `trajectory.png`
- `speed.png`
- `inputs.png`

---

## Control

Control de alto nivel con:

- **PID** desacoplados
- Seguimiento de puntos en el plano XY
- **Anti-windup** y gestión de saturación
- Operación manual o autónoma (ROS2 opcional)

Barrido de parámetros:

```bash
python design_sweep.py --out sweep_out --m 5 40 8 --f 20 160 8
```

Permite localizar **zonas óptimas de rendimiento**.

---

## Prototipo experimental

**Configuración:**

- Chasis ligero PLA + refuerzos
- 2 ventiladores eléctricos + control ESC
- IMU para orientación
- Odometría óptica / UWB para velocidad
- Firmware propio en Arduino

**Mediciones realizadas:**

- Empuje y sustentación
- Consumo energético
- Tracking angular y de posición

**Resultados clave:**

- Estabilidad adecuada en maniobras moderadas
- Fuerte dependencia de fricción residual en sellado inferior
- Control efectivo bajo viento limitado, con saturaciones intermitentes

---

## Roadmap: Aerodeslizador gravitacional

Basado en mis avances teóricos sobre **métricas fractalizadas del espacio-tiempo**, se propone un sistema que logre **sustentación sin contacto** sin aire comprimido ni fuerza electromagnética.

Secuencia prevista de evolución tecnológica:

1. Hovercraft tradicional
2. Maglev y superconducción
3. Control de campos gravitacionales locales
4. **Sustentación gravitacional estable**

No existe ingeniería actual para este punto final, pero **el camino está clarificado**.

---

## Repositorio

Código y experimentación:

[GitHub](https://github.com/corvo001/HovercraftLab) *(placeholder)*

---

## Estado actual del proyecto

- Simulación y control **funcionales**
- Primer prototipo real **validado**
- Ampliación hacia electrónica avanzada y nuevos materiales **en progreso**
- Integración con mi investigación gravitacional **planificada**

---

Este proyecto demuestra **ingeniería aplicada real**: diseño matemático → simulación → prototipo físico → análisis. Un paso sólido hacia tecnologías de movilidad radicalmente nuevas.
