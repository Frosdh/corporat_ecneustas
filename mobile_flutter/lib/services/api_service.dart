import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  final SharedPreferences prefs;
  
  // URL base configurable. Por defecto apunta al dominio configurado,
  // pero el encuestador puede cambiarla si hace pruebas locales (ej. http://10.0.2.2/san-bartolome/api.php)
  String _baseUrl = 'https://corporativoqbank.com/san-bartolome/api.php';
  String? _sessionId;
  Map<String, dynamic>? _currentUser;

  ApiService(this.prefs) {
    _baseUrl = prefs.getString('api_base_url') ?? 'https://corporativoqbank.com/san-bartolome/api.php';
  }

  String get baseUrl => _baseUrl;
  bool get isLoggedIn => _currentUser != null;
  Map<String, dynamic>? get currentUser => _currentUser;
  String? get sessionId => _sessionId;

  // Actualiza y persiste la URL Base de la API
  Future<void> setBaseUrl(String newUrl) async {
    _baseUrl = newUrl;
    await prefs.setString('api_base_url', newUrl);
  }

  // Carga la sesión guardada localmente
  Future<void> loadSavedSession() async {
    _sessionId = prefs.getString('php_session_id');
    final userJson = prefs.getString('current_user_json');
    if (userJson != null) {
      try {
        _currentUser = jsonDecode(userJson) as Map<String, dynamic>;
      } catch (_) {
        _currentUser = null;
      }
    }
  }

  // Guarda la sesión localmente
  Future<void> _saveSession(String? sessionId, Map<String, dynamic>? user) async {
    _currentUser = user;

    if (user == null) {
      _sessionId = null;
      await prefs.remove('php_session_id');
      await prefs.remove('current_user_json');
      return;
    }

    // Preserva el ID de sesión existente si el nuevo parámetro es nulo,
    // o genera un identificador local único y seguro como fallback.
    if (sessionId != null) {
      _sessionId = sessionId;
    } else if (_sessionId == null) {
      _sessionId = 'local_${DateTime.now().millisecondsSinceEpoch}';
    }

    await prefs.setString('php_session_id', _sessionId!);
    await prefs.setString('current_user_json', jsonEncode(user));
  }

  // Inyecta la Cookie de PHP en las cabeceras
  Map<String, String> _buildHeaders({bool isJson = true}) {
    final Map<String, String> headers = {};
    if (isJson) {
      headers['Content-Type'] = 'application/json; charset=UTF-8';
    }
    if (_sessionId != null) {
      // Enviamos el identificador tanto con el nombre de sesión personalizado (san_bartolome_app)
      // como con el estándar (PHPSESSID) para garantizar máxima compatibilidad con el servidor.
      headers['Cookie'] = 'san_bartolome_app=$_sessionId; PHPSESSID=$_sessionId';
    }
    return headers;
  }

  // Extrae y guarda el ID de sesión de la cabecera Set-Cookie de forma tolerante a mayúsculas/minúsculas
  void _extractCookie(http.Response response) {
    String? setCookie;
    
    // Búsqueda case-insensitive tolerante para la cabecera 'set-cookie'
    response.headers.forEach((key, value) {
      if (key.toLowerCase() == 'set-cookie') {
        setCookie = value;
      }
    });

    if (setCookie != null) {
      // Intentamos capturar el valor de 'san_bartolome_app' primero (definido en config.php)
      final regExpApp = RegExp(r'san_bartolome_app=([^;]+)');
      final matchApp = regExpApp.firstMatch(setCookie!);
      if (matchApp != null) {
        _sessionId = matchApp.group(1);
        return;
      }

      // Si no existe, buscamos el valor del estándar 'PHPSESSID'
      final regExpPhp = RegExp(r'PHPSESSID=([^;]+)');
      final matchPhp = regExpPhp.firstMatch(setCookie!);
      if (matchPhp != null) {
        _sessionId = matchPhp.group(1);
        return;
      }
    }
  }

  // Método de Login (Inicio de sesión)
  Future<Map<String, dynamic>> login(String username, String password) async {
    final url = Uri.parse('$_baseUrl?action=login');
    final response = await http.post(
      url,
      headers: _buildHeaders(isJson: true),
      body: jsonEncode({
        'username': username,
        'password': password,
      }),
    );

    final responseData = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode == 200 && responseData['ok'] == true) {
      _extractCookie(response);
      final user = responseData['user'] as Map<String, dynamic>;
      await _saveSession(_sessionId, user);
      return responseData;
    } else {
      throw Exception(responseData['message'] ?? 'Error de inicio de sesión');
    }
  }

  // Método de Registro de Ficha/Postulación de Encuestador (Crea usuario y carga archivos)
  Future<Map<String, dynamic>> registerApplication(
    Map<String, String> fields,
    Map<String, String> filePaths,
  ) async {
    final url = Uri.parse('$_baseUrl?action=register-application');
    
    // Creamos la petición multipart/form-data
    final request = http.MultipartRequest('POST', url);
    
    // Adjuntamos las cabeceras (incluyendo sesión si existiera)
    request.headers.addAll(_buildHeaders(isJson: false));

    // Agregamos los campos de texto del formulario
    fields.forEach((key, value) {
      request.fields[key] = value;
    });

    // Adjuntamos los archivos cargados (foto de perfil, cédula y respaldo opcional)
    for (var entry in filePaths.entries) {
      if (entry.value.isNotEmpty) {
        request.files.add(
          await http.MultipartFile.fromPath(
            entry.key, // Nombre del campo de archivo en la API (profile_photo, id_document, support_document)
            entry.value,
          ),
        );
      }
    }

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);
    final responseData = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode == 200 && responseData['ok'] == true) {
      return responseData;
    } else {
      throw Exception(responseData['message'] ?? 'Error al registrar la postulación');
    }
  }

  // Método de Cierre de sesión (Logout)
  Future<void> logout() async {
    final url = Uri.parse('$_baseUrl?action=logout');
    try {
      await http.get(url, headers: _buildHeaders(isJson: false));
    } catch (_) {}
    await _saveSession(null, null);
  }

  // Consulta el estado del usuario en tiempo real (Bootstrap)
  Future<Map<String, dynamic>> bootstrap() async {
    final url = Uri.parse('$_baseUrl?action=bootstrap');
    final response = await http.get(url, headers: _buildHeaders(isJson: false));

    final responseData = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode == 200 && responseData['ok'] == true) {
      final user = responseData['user'] as Map<String, dynamic>;
      // Actualizamos los datos del usuario en la sesión guardada
      await _saveSession(_sessionId, user);
      return responseData;
    } else {
      throw Exception(responseData['message'] ?? 'Error de sincronización de sesión');
    }
  }

  // Guarda una encuesta en el servidor
  Future<Map<String, dynamic>> saveSurvey(Map<String, dynamic> surveyData) async {
    final url = Uri.parse('$_baseUrl?action=save-survey');
    final response = await http.post(
      url,
      headers: _buildHeaders(isJson: true),
      body: jsonEncode(surveyData),
    );

    final responseData = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode == 200 && responseData['ok'] == true) {
      return responseData;
    } else {
      throw Exception(responseData['message'] ?? 'Error al guardar la encuesta');
    }
  }

  // Obtiene el historial de encuestas del encuestador actual
  Future<List<dynamic>> mySurveys() async {
    final url = Uri.parse('$_baseUrl?action=my-surveys');
    final response = await http.get(
      url,
      headers: _buildHeaders(isJson: false),
    );

    final responseData = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode == 200 && responseData['ok'] == true) {
      return responseData['surveys'] as List<dynamic>;
    } else {
      throw Exception(responseData['message'] ?? 'Error al consultar encuestas');
    }
  }

  // Sincroniza un lote de encuestas
  Future<Map<String, dynamic>> syncSurveys(List<Map<String, dynamic>> surveys) async {
    final url = Uri.parse('$_baseUrl?action=sync');
    
    // Mapeamos cada encuesta en la lista para que women_roles, etc. sean cadenas unidas por '|'
    final preparedSurveys = surveys.map((s) {
      final prepared = Map<String, dynamic>.from(s);
      if (prepared['women_roles'] is List) {
        prepared['women_roles'] = (prepared['women_roles'] as List).join('|');
      }
      if (prepared['mine_benefits'] is List) {
        prepared['mine_benefits'] = (prepared['mine_benefits'] as List).join('|');
      }
      if (prepared['mine_risks'] is List) {
        prepared['mine_risks'] = (prepared['mine_risks'] as List).join('|');
      }
      return prepared;
    }).toList();

    final response = await http.post(
      url,
      headers: _buildHeaders(isJson: true),
      body: jsonEncode({'surveys': preparedSurveys}),
    );

    final responseData = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode == 200 && responseData['ok'] == true) {
      return responseData;
    } else {
      throw Exception(responseData['message'] ?? 'Error al sincronizar encuestas');
    }
  }
}
