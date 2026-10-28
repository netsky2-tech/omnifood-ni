# Delta: La política de supervisión la define el tenant

## ADDED Requirements

### Requirement: SP-01 — La política de supervisión es del tenant

El backoffice MUST poder definir, por negocio, **qué roles pueden autorizar** una
operación sensible y **qué operaciones admiten la firma del propio operador** cuando no
hay nadie disponible para firmarlas.

La terminal MUST aplicar esa política. MUST NOT decidir la regla por su cuenta.

#### Scenario: El negocio define quién autoriza

- GIVEN un negocio con la política configurada (roles `OWNER` y `MANAGER`)
- WHEN la terminal recibe el snapshot de configuración
- THEN la política MUST quedar aplicada en la terminal
- AND un operador con rol `CASHIER` MUST NOT poder autorizar en nombre del negocio.

#### Scenario: Un negocio sin política

- GIVEN un negocio que nunca configuró la política
- WHEN la terminal recibe el snapshot de configuración
- THEN la terminal MUST aplicar el valor por defecto de su modo de operación
- AND ese valor por defecto MUST permitir completar el cierre de turno.

### Requirement: SP-02 — La política viaja por el canal de configuración

La política MUST viajar a las terminales en el **snapshot de configuración** (revisión +
fingerprint + acuse del terminal). MUST NOT existir un segundo mecanismo de sincronización
para ella.

Un cambio de política MUST producir una revisión nueva del snapshot (para que las
terminales lo reciban) y MUST NOT alterar la ruta fiscal.

#### Scenario: El backoffice guarda y la terminal lo recibe

- GIVEN un backoffice conectado a un terminal
- WHEN el dueño guarda una política distinta de la vigente
- THEN el snapshot MUST quedar en una revisión nueva
- AND el terminal MUST aplicar la política nueva en su próxima sincronización.

#### Scenario: El backoffice restablece la política

- GIVEN un negocio con una política configurada
- WHEN el dueño la restablece
- THEN el snapshot MUST volver a declarar «sin política»
- AND cada terminal MUST volver al valor por defecto de su modo de operación.

### Requirement: SP-03 — Ninguna política puede dejar el cierre de turno imposible

El cierre de turno (Corte Z) es una **obligación fiscal**: un turno sin cerrar es un
problema fiscal peor que un turno auto-autorizado.

El backoffice MUST rechazar una política que, sin ningún rol que autorice y sin
auto-autorización del cierre de turno, dejaría el corte de caja imposible de completar.
La terminal MUST **no aplicar** tal política (fallo seguro): conserva el valor por
defecto de su modo de operación.

#### Scenario: El backoffice avisa antes de bloquear

- GIVEN una política sin ningún rol autorizado y con el cierre de turno sin
  auto-autorización
- WHEN el dueño la edita en el backoffice
- THEN la interfaz MUST explicar el problema en palabras
- AND MUST NOT permitir guardarla.

#### Scenario: La terminal no aplica una política imposible

- GIVEN un snapshot con una política que dejaría el cierre de turno imposible
- WHEN la terminal la recibe
- THEN la terminal MUST NOT aplicar esa política
- AND MUST seguir pudiendo completar el cierre de turno.

#### Scenario: Un avatar que no es una obligación no bloquea

- GIVEN una política sin ningún rol autorizado y sin auto-autorización del descuento
  manual
- WHEN el dueño la guarda
- THEN el backoffice MUST avisar (advertencia) y MUST guardarla
- AND MUST NOT bloquearla.

### Requirement: SP-04 — Quien no puede configurarla, no la ve

Editar la política MUST exigir un permiso. Un usuario sin ese permiso MUST NOT ver la
sección ni poder consultarla: no hay marcadores de «sin permiso» ni pantallas vacías.

#### Scenario: Un cajero en el backoffice

- GIVEN un usuario sin el permiso de configurar la supervisión
- WHEN abre Configuración
- THEN la pestaña de supervisión MUST NOT estar disponible
- AND la política MUST NOT consultarse.

### Requirement: SP-05 — La terminal dice la verdad de la entrega

El backoffice MUST decir que las terminales aplican la política **en su próxima
sincronización**: la terminal es offline-first y no cambia en el instante del clic.

#### Scenario: El dueño guarda

- GIVEN el backoffice de un negocio con terminales conectadas
- WHEN el dueño guarda la política
- THEN la interfaz MUST recordar que el cambio llega a las terminales en su próxima
  sincronización.

### Requirement: SP-06 — La política se registra como un asiento

La terminal MUST registrar, en la cadena de auditoría forense, quién firmó cada
operación con la política vigente, con su credencial y si hubo supervisor. La política
MUST NOT alterar esa traza: sólo la define.

#### Scenario: Un cierre de turno auto-autorizado

- GIVEN una política que admite la auto-autorización del cierre de turno
- WHEN el operador cierra su turno sin supervisor
- THEN la traza MUST registrar la auto-autorización, el usuario, su credencial y que no
  hubo supervisor.
