/**
 * Spanish translations, the english text is the key
 */
const es: { [text: string]: string } = {
    // menu
    TV: 'TV',
    Search: 'Buscar',
    Recordings: 'Grabaciones',
    Setup: 'Ajustes',
    Help: 'Ayuda',
    Contact: 'Contacto',

    // startup
    'Connecting...': 'Conectando...',
    'Loading channels...': 'Cargando canales...',
    'Failed to connect to TVH: {0}': 'No se pudo conectar con TVHeadend: {0}',
    'Failed to retrieve channels: {0}': 'No se pudieron cargar los canales: {0}',

    // channel info and live tv
    Rec: 'Grabar',
    Menu: 'Menú',
    Audio: 'Audio',
    EPG: 'Guía',
    'No Information': 'Sin información',
    'Channel {0} not found': 'No existe el canal {0}',
    'The channel could not be played': 'No se ha podido reproducir el canal',
    Off: 'Desactivados',
    'Track {0}': 'Pista {0}',

    // channel groups
    'All channels': 'Todos los canales',
    Favorites: 'Favoritos',
    Favorite: 'Favorito',
    Group: 'Grupo',

    // picture in picture
    'Loading...': 'Cargando...',
    Swap: 'Intercambiar',
    Close: 'Cerrar',
    'Picture in picture could not be started. Your TV might not support two videos at once.':
        'No se ha podido iniciar la imagen en imagen. Puede que tu TV no permita dos vídeos a la vez.',

    // search
    'Program title': 'Título del programa',
    'No programs found': 'No se han encontrado programas',
    Now: 'Ahora',

    // recordings
    'Added DVR entry: {0}': 'Grabación programada: {0}',
    'Cancelled DVR entry: {0}': 'Grabación cancelada: {0}',
    'Deleted DVR entry: {0}': 'Grabación borrada: {0}',

    // setup
    'TVheadend Setup': 'Configuración de TVHeadend',
    'TVheadend URL': 'URL de TVHeadend',
    'User (Optional)': 'Usuario (opcional)',
    'Password (Optional)': 'Contraseña (opcional)',
    'Picture in Picture': 'Imagen en imagen',
    'Streaming profile (Optional)': 'Perfil de streaming (opcional)',
    Connect: 'Conectar',
    Save: 'Guardar',
    'Connection Test Results': 'Resultado de la prueba de conexión',
    'Device Info: ': 'Dispositivo: ',
    'Server Info: ': 'Servidor: ',
    'Playlist: ': 'Lista de canales: ',
    'Stream: ': 'Stream: ',
    'EPG: ': 'Guía: ',
    'DVR: ': 'Grabador: ',
    'loaded {0} channels': '{0} canales cargados',
    'verified access to video stream': 'acceso al vídeo comprobado',
    'verified access to EPG': 'acceso a la guía comprobado',
    'verified access to DVR': 'acceso al grabador comprobado',
    'No channels available - verification of channel stream not possible':
        'No hay canales: no se puede comprobar el acceso al vídeo',
    'User authentication is required or provided user/password is wrong':
        'Hace falta usuario o el usuario/contraseña no es correcto',
    'User is missing privileges please verify user setup in tvheadend':
        'El usuario no tiene permisos suficientes, revisa su configuración en TVHeadend',
    'User is missing privileges to access the stream url': 'El usuario no tiene permisos para acceder al vídeo',
    'Using Version 4.3 with User Authentication requires activation of "Persistence Token" in the Users Password setttings of TVHeadend':
        'Con la versión 4.3 y usuario hay que activar "Persistent authentication" en la contraseña del usuario en TVHeadend',
    'App user needs TVHeadend "Web" privileges to handle EPG, DVR and version specific handling':
        'El usuario de la app necesita el permiso "Web interface" de TVHeadend para la guía, las grabaciones y la detección de versión'
};

export default es;
