// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status and the reports of the two Configuration actions. Four
// languages, the four of the Gladys interface; German says "du", Spanish
// "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Shown by Gladys under the integration name when it is not connected.
export const CONNECTION_TEXT = {
  notConfigured: {
    en: 'Enter the e-mail address and password of your Panasonic ID.',
    fr: "Saisissez l'adresse e-mail et le mot de passe de votre Panasonic ID.",
    de: 'Gib die E-Mail-Adresse und das Passwort deiner Panasonic ID ein.',
    es: 'Introduzca la dirección de correo y la contraseña de su Panasonic ID.',
  },
  credentials: {
    en: 'Panasonic refuses this e-mail address or password. Check them in the Comfort Cloud app, then here.',
    fr: "Panasonic refuse cette adresse e-mail ou ce mot de passe. Vérifiez-les dans l'application Comfort Cloud, puis ici.",
    de: 'Panasonic lehnt diese E-Mail-Adresse oder dieses Passwort ab. Prüfe sie in der Comfort-Cloud-App und dann hier.',
    es: 'Panasonic rechaza esta dirección de correo o contraseña. Compruébelas en la aplicación Comfort Cloud y después aquí.',
  },
  mfa: {
    en: 'Panasonic asks for a two-factor code: run "Sign in with a 2FA code" with the code of your authenticator app.',
    fr: "Panasonic demande un code à deux facteurs : lancez « Se connecter avec un code 2FA » avec le code de votre application d'authentification.",
    de: 'Panasonic verlangt einen Zwei-Faktor-Code: Starte „Mit 2FA-Code anmelden“ mit dem Code deiner Authenticator-App.',
    es: 'Panasonic pide un código de doble factor: ejecute «Iniciar sesión con un código 2FA» con el código de su aplicación de autenticación.',
  },
  agreement: {
    en: 'Panasonic has new terms of use: open the Comfort Cloud app and accept them.',
    fr: "Panasonic a de nouvelles conditions d'utilisation : ouvrez l'application Comfort Cloud et acceptez-les.",
    de: 'Panasonic hat neue Nutzungsbedingungen: Öffne die Comfort-Cloud-App und akzeptiere sie.',
    es: 'Panasonic tiene nuevas condiciones de uso: abra la aplicación Comfort Cloud y acéptelas.',
  },
  version: {
    en: 'Comfort Cloud refuses the app version announced. Enter the current version of the Comfort Cloud app in the advanced settings.',
    fr: "Comfort Cloud refuse la version d'application annoncée. Saisissez la version actuelle de l'application Comfort Cloud dans les réglages avancés.",
    de: 'Comfort Cloud lehnt die angegebene App-Version ab. Gib in den erweiterten Einstellungen die aktuelle Version der Comfort-Cloud-App ein.',
    es: 'Comfort Cloud rechaza la versión de la aplicación anunciada. Introduzca la versión actual de la aplicación Comfort Cloud en los ajustes avanzados.',
  },
  unreachable: {
    en: 'Panasonic Comfort Cloud does not answer. Gladys tries again by itself.',
    fr: 'Panasonic Comfort Cloud ne répond pas. Gladys réessaie toute seule.',
    de: 'Panasonic Comfort Cloud antwortet nicht. Gladys versucht es selbst erneut.',
    es: 'Panasonic Comfort Cloud no responde. Gladys lo vuelve a intentar por sí mismo.',
  },
  noUnit: {
    en: 'No air conditioner in this Panasonic account. Add your units in the Comfort Cloud app.',
    fr: "Aucun climatiseur dans ce compte Panasonic. Ajoutez vos unités dans l'application Comfort Cloud.",
    de: 'Keine Klimaanlage in diesem Panasonic-Konto. Füge deine Geräte in der Comfort-Cloud-App hinzu.',
    es: 'No hay ningún aire acondicionado en esta cuenta de Panasonic. Añada sus equipos en la aplicación Comfort Cloud.',
  },
};

const MAX_LISTED = 8;

// The pieces of the "Search for air conditioners" report, one table per language.
export const REFRESH_TEXT = {
  en: {
    none: 'No air conditioner in this Panasonic account.',
    count: (total, answering) => `${total} air conditioner(s), ${answering} answering:`,
    answering: 'answers',
    unreachable: 'not answering',
    others: (count) => `${count} other Panasonic appliance(s) (Aquarea, hot water) not supported.`,
  },
  fr: {
    none: 'Aucun climatiseur dans ce compte Panasonic.',
    count: (total, answering) => `${total} climatiseur(s), ${answering} répondent :`,
    answering: 'répond',
    unreachable: 'ne répond pas',
    others: (count) =>
      `${count} autre(s) appareil(s) Panasonic (Aquarea, eau chaude) non pris en charge.`,
  },
  de: {
    none: 'Keine Klimaanlage in diesem Panasonic-Konto.',
    count: (total, answering) => `${total} Klimaanlage(n), davon ${answering} erreichbar:`,
    answering: 'antwortet',
    unreachable: 'antwortet nicht',
    others: (count) =>
      `${count} andere(s) Panasonic-Gerät(e) (Aquarea, Warmwasser) nicht unterstützt.`,
  },
  es: {
    none: 'No hay ningún aire acondicionado en esta cuenta de Panasonic.',
    count: (total, answering) => `${total} aire(s) acondicionado(s), ${answering} responde(n):`,
    answering: 'responde',
    unreachable: 'no responde',
    others: (count) =>
      `${count} otro(s) aparato(s) Panasonic (Aquarea, agua caliente) no compatible(s).`,
  },
};

/**
 * The report of the "Search for air conditioners" action, in the four
 * languages: the account problem if any, else the units.
 * @param {object} summary hub.summary()
 */
export function refreshMessage(summary) {
  if (summary.problem) {
    return CONNECTION_TEXT[summary.problem];
  }
  const message = {};
  for (const [language, text] of Object.entries(REFRESH_TEXT)) {
    const lines = [];
    const units = summary.units;
    if (units.length === 0) {
      lines.push(text.none);
    } else {
      const answering = units.filter((unit) => unit.answering).length;
      lines.push(text.count(units.length, answering));
      for (const unit of units.slice(0, MAX_LISTED)) {
        const model = unit.model ? ` (${unit.model})` : '';
        lines.push(
          `- ${unit.names[language]}${model}: ${unit.answering ? text.answering : text.unreachable}`,
        );
      }
      if (units.length > MAX_LISTED) {
        lines.push(`- … +${units.length - MAX_LISTED}`);
      }
    }
    if (summary.others > 0) {
      lines.push(text.others(summary.others));
    }
    message[language] = lines.join('\n');
  }
  return message;
}

// The "Sign in with a 2FA code" action.
export const SIGN_IN_TEXT = {
  noCode: {
    en: 'Enter the 6-digit code shown by your authenticator app.',
    fr: "Saisissez le code à 6 chiffres affiché par votre application d'authentification.",
    de: 'Gib den 6-stelligen Code ein, den deine Authenticator-App anzeigt.',
    es: 'Introduzca el código de 6 cifras que muestra su aplicación de autenticación.',
  },
  refused: {
    en: 'Panasonic refused this code. Codes change every 30 seconds: try again with a fresh one.',
    fr: 'Panasonic a refusé ce code. Les codes changent toutes les 30 secondes : réessayez avec un code récent.',
    de: 'Panasonic hat diesen Code abgelehnt. Die Codes ändern sich alle 30 Sekunden: Versuche es mit einem neuen.',
    es: 'Panasonic ha rechazado este código. Los códigos cambian cada 30 segundos: inténtelo con uno nuevo.',
  },
  notNeeded: {
    en: 'Signed in: Panasonic did not ask for a code this time.',
    fr: "Connecté : Panasonic n'a pas demandé de code cette fois.",
    de: 'Angemeldet: Panasonic hat diesmal keinen Code verlangt.',
    es: 'Sesión iniciada: Panasonic no ha pedido ningún código esta vez.',
  },
  signedIn: {
    en: 'Signed in. The session is kept: the code is only needed again if Panasonic asks for it.',
    fr: 'Connecté. La session est conservée : le code ne resservira que si Panasonic le redemande.',
    de: 'Angemeldet. Die Sitzung bleibt erhalten: Ein Code ist erst wieder nötig, wenn Panasonic ihn verlangt.',
    es: 'Sesión iniciada. La sesión se conserva: el código solo vuelve a hacer falta si Panasonic lo pide.',
  },
};
