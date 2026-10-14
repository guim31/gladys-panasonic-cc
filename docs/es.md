# Panasonic Comfort Cloud

Controle sus aires acondicionados y bombas de calor aire-aire Panasonic desde Gladys, a través de Panasonic Comfort Cloud: encendido/apagado, modo, consigna, velocidad del ventilador, lamas, modos Powerful y silencioso, nanoe, ECONAVI y AI Eco, temperaturas interior y exterior, y la energía consumida.

> Developed without the hardware: feedback welcome. Esta integración se ha escrito y probado con respuestas grabadas de la API de Comfort Cloud y del cliente de código abierto de referencia, no con una cuenta ni un equipo reales. Indique lo que funciona y lo que no en [GitHub](https://github.com/guim31/gladys-panasonic-cc/issues).

Esta integración no está afiliada a Panasonic.

## Hardware compatible

Todo **aire acondicionado o bomba de calor aire-aire** Panasonic (Etherea, TZ, Z, conductos, cassettes...) configurado en la aplicación **Panasonic Comfort Cloud**, con su adaptador Wi-Fi (integrado, o CZ-TACG1 / CZ-CAPWFC1). Cada unidad interior se convierte en un dispositivo de Gladys.

No compatibles: las bombas de calor aire-agua Aquarea y los depósitos de agua caliente, aunque aparezcan en la misma aplicación (la búsqueda los cuenta como «no compatibles»).

## Requisitos

- Gladys **5.2.0** o posterior.
- Un **Panasonic ID** (correo y contraseña) con los equipos en su aplicación Comfort Cloud.
- Acceso a Internet para Gladys: todo pasa por la nube de Panasonic, nada es local.
- Si su cuenta usa la autenticación de doble factor, su aplicación de autenticación a mano para el primer inicio de sesión.

## Instalación y configuración

1. En Gladys, abra **Integraciones → Instalar desde GitHub** e introduzca `https://github.com/guim31/gladys-panasonic-cc`.
2. Abra la pestaña **Configuración** de la integración. Los ajustes:
   - **Panasonic ID (correo)** y **Contraseña**: los de la aplicación Comfort Cloud. Consejo: Panasonic permite compartir los equipos con una segunda cuenta en la aplicación; una cuenta dedicada a Gladys separa sus sesiones de las suyas.
   - **Intervalo de actualización**: frecuencia de lectura de cada equipo (2 minutos por defecto, como la integración de Home Assistant).
   - **Idioma de los nombres de las funciones**: idioma de los nombres de las funciones de los nuevos dispositivos (francés por defecto). Los dispositivos conservan los nombres de la aplicación.
   - **Avanzado**, **Versión de la aplicación Comfort Cloud**: déjelo vacío. Panasonic solo responde a las versiones recientes de su aplicación; la integración lee sola la versión actual en Google Play. Rellénelo solo si el estado de conexión indica que la versión es rechazada.
3. Abra la pestaña **Descubrir**: cada unidad interior de la cuenta aparece con su nombre en la aplicación. Añada las que desee a Gladys.

El botón **Buscar aires acondicionados** (pestaña Configuración) vuelve a leer la cuenta y lista cada equipo, su modelo y si responde.

### Autenticación de doble factor

Si Panasonic pide un código, el estado de conexión lo indica. Abra la aplicación de autenticación y ejecute **Iniciar sesión con un código 2FA** (pestaña Configuración) con el código de 6 cifras mostrado, en menos de 30 segundos. La sesión se conserva después en Gladys: el código solo vuelve a hacer falta si Panasonic pide un nuevo inicio de sesión.

### Lo que se guarda

La integración guarda en su propio volumen (`/data`, legible solo por el contenedor) la sesión de Comfort Cloud (tokens de acceso y de renovación), la versión de la aplicación y el contador de energía de cada equipo. La contraseña permanece en la configuración de Gladys y solo se envía a Panasonic cuando la sesión no puede renovarse. Ni la contraseña ni los tokens se escriben nunca en los registros.

## Dispositivos y funciones

Cada unidad interior es un dispositivo de Gladys. Sus funciones dependen de lo que el equipo anuncia:

| Función                                            | Lo que hace                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Encendido/apagado**                              | Enciende o apaga el equipo.                                                                                                                       |
| **Modo**                                           | Auto, Frío, Calor, Seco, Ventilador (solo los modos del equipo). Elegir un modo enciende el equipo.                                               |
| **Temperatura objetivo**                           | La consigna, por medios grados, de 16 a 30 °C (desde 8 °C en los equipos con el antihielo 8/15 °C).                                               |
| **Velocidad del ventilador**                       | Auto, Baja, Baja-Media, Media, Media-Alta, Alta.                                                                                                  |
| **Oscilación vertical**, **Oscilación horizontal** | Oscilante («Auto» en Panasonic) o una de cinco posiciones fijas; la horizontal solo en los equipos con lama izquierda/derecha.                    |
| **Temperatura interior**                           | La temperatura medida por la unidad interior.                                                                                                     |
| **Temperatura exterior**                           | La temperatura medida por la unidad exterior, cuando la indica.                                                                                   |
| **Modo Powerful**, **Modo silencioso**             | Los modos especiales de Panasonic; se excluyen entre sí. Solo en los equipos que los tienen.                                                      |
| **nanoe**, **ECONAVI**, **AI Eco**                 | La purificación de aire y los sensores eco de los equipos que los tienen.                                                                         |
| **Energía de hoy**                                 | Lo que el equipo ha consumido hoy (kWh), según el historial de Comfort Cloud.                                                                     |
| **Energía consumida**                              | Un contador (kWh) que solo sube, construido a partir del historial diario, para el seguimiento de energía de Gladys. Empieza con el mes en curso. |

Una consigna, una posición de lama o un modo especial pedidos con el equipo **apagado** no lo encienden: se muestran enseguida, se guardan y se envían en el próximo encendido (como el cliente de referencia sin encendido automático). Una escena que prepara la consigna de la noche nunca arranca el equipo por sorpresa. La velocidad del ventilador, nanoe, ECONAVI y AI Eco se envían enseguida.

Los cambios hechos con el mando o la aplicación se recogen en la lectura siguiente.

## Widget

El widget **Aire acondicionado** (elija el equipo en su configuración) muestra la temperatura de la estancia, la consigna y la temperatura exterior (o la energía del día), luego el modo, la velocidad del ventilador, el modo especial y la energía del día. Sus botones:

- **Encender** / **Apagar**;
- **−0,5 °C** y **+0,5 °C**;
- **Modo y ventilador**: un pequeño formulario para elegir juntos el modo, el ventilador y el modo especial, enviados en una sola llamada; el equipo se enciende.

## Disparador de escena

- **Inicio de sesión Panasonic necesario**: Comfort Cloud ya no acepta la sesión. El motivo está disponible para la escena en una variable (`reason`): `password` (contraseña rechazada), `two_factor` (se pide un código) o `terms` (nuevas condiciones de uso por aceptar en la aplicación). Se dispara una vez por problema, no en cada intento: útil para enviarse un mensaje en lugar de descubrir días después que el aire acondicionado ya no responde.

## Acción de escena

- **Aplicar un ajuste de climatización**: enciende el equipo con su modo, consigna, velocidad del ventilador y modo especial en **una sola** llamada a Comfort Cloud, donde las acciones estándar de Gladys harían una llamada por función (varios segundos cada una). Un campo vacío conserva el ajuste actual. La consigna acepta medios grados (`22,5` o `22.5`). La consigna aplicada se devuelve a la escena.

Para apagar el equipo, o cambiar un solo ajuste, use la acción estándar «Controlar un dispositivo» de Gladys.

## Ejemplos de escenas

- **Calentar el salón antes de despertar**: a las 6:30 los días laborables, «Aplicar un ajuste de climatización» en Calor a 21 °C, ventilador Auto, modo especial Normal.
- **Refrescar el dormitorio en silencio**: a las 22:00, si el dormitorio supera 26 °C, «Aplicar un ajuste de climatización» en Frío a 25 °C, ventilador Baja, modo especial Silencioso.
- **Nadie en casa**: cuando sale la última persona, apagar todos los aires acondicionados.
- **Alerta de inicio de sesión**: con «Inicio de sesión Panasonic necesario», enviar el mensaje «Panasonic requiere su atención: {{triggerEvent.data.reason}}».

## Actualización y cuotas

- Panasonic no publica ninguna cuota, pero Comfort Cloud es lento (una lectura tarda unos segundos) y frena las cuentas que lo llaman demasiado a menudo. Por eso la integración hace **una llamada cada vez**, solo lee los equipos añadidos a Gladys, cada 2 minutos por defecto (el ritmo de la integración de Home Assistant), y el historial de energía como mucho cada 5 minutos.
- La integración lee los equipos por sí misma; el sondeo de Gladys solo es un respaldo.
- Después de una orden, el equipo se vuelve a leer 3 segundos más tarde para confirmar el estado.
- Cuando Comfort Cloud falla, el ritmo se ralentiza (hasta 10 minutos) hasta que vuelve a responder. Un equipo al que la nube no llega se lee un tiempo en la última copia de la nube y luego se marca como que no responde.
- La lista de equipos se vuelve a leer cada 30 minutos (equipos nuevos o renombrados).
- Solo se envían a Gladys los valores que cambian, más un recordatorio cada 6 horas para que un valor estable nunca parezca antiguo.

## Solución de problemas

- **«Panasonic rechaza esta dirección de correo o contraseña»**: compruebe que puede iniciar sesión con ellas en la aplicación Comfort Cloud y corríjalas en la configuración. La integración nunca vuelve a probar por sí sola una contraseña rechazada (podría bloquear la cuenta): guardar la configuración o ejecutar **Buscar aires acondicionados** lo vuelve a intentar.
- **«Panasonic pide un código de doble factor»**: ejecute **Iniciar sesión con un código 2FA** con un código reciente.
- **«Panasonic tiene nuevas condiciones de uso»**: abra la aplicación Comfort Cloud y acéptelas; la integración lo vuelve a intentar cada 30 minutos.
- **«Comfort Cloud rechaza la versión de la aplicación anunciada»**: busque la versión de la aplicación Comfort Cloud en su tienda e introdúzcala en **Versión de la aplicación Comfort Cloud**.
- **Un equipo no responde**: compruébelo en la aplicación; el adaptador Wi-Fi puede haber perdido la conexión.
- **Más detalles**: ponga la variable de entorno `LOG_LEVEL` del contenedor en `debug`.

## Límites

- Developed without the hardware: feedback welcome en [GitHub](https://github.com/guim31/gladys-panasonic-cc/issues).
- Solo nube: ningún control local, y la integración deja de funcionar si Panasonic cambia su inicio de sesión o su API, hasta que se actualice.
- Los valores de energía vienen del historial de Comfort Cloud, con un retraso de una hora aproximadamente; los equipos sin medición de energía no tienen funciones de energía.
- No gestionados: el modo iAuto-X, el ajuste antihielo 8/15 °C (el rango de consigna lo permite), los temporizadores semanales, las zonas de los equipos de conductos, la limpieza interior.
- Las bombas de calor Aquarea y los depósitos de agua caliente no son compatibles.
