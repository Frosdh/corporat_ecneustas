import 'dart:convert';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/gps_service.dart';
import 'login_screen.dart';

class SurveyorHomeScreen extends StatefulWidget {
  final ApiService apiService;

  const SurveyorHomeScreen({Key? key, required this.apiService}) : super(key: key);

  @override
  State<SurveyorHomeScreen> createState() => _SurveyorHomeScreenState();
}

class _SurveyorHomeScreenState extends State<SurveyorHomeScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _isSyncingUser = false;
  bool _isSubmittingSurvey = false;
  bool _isFetchingMySurveys = false;
  bool _isCapturingGps = false;
  bool _isSurveyActive = false;
  String? _syncError;
  String? _surveyError;
  String? _gpsStatus;
  
  List<dynamic> _mySurveys = [];
  List<Map<String, dynamic>> _offlineSurveys = [];

  // Form Key & Controllers
  final _formKey = GlobalKey<FormState>();
  final _communityController = TextEditingController();
  final _occupationController = TextEditingController();
  final _commentsController = TextEditingController();
  final _latitudeController = TextEditingController();
  final _longitudeController = TextEditingController();

  // Dropdown Form Values
  String? _selectedSector;
  String? _selectedGender;
  String? _selectedAgeRange;
  String? _selectedEducation;
  String? _selectedProblem;
  String? _selectedYouthPath;
  String? _selectedWaterSource;
  String? _selectedSewer;
  String? _selectedInternet;
  String? _selectedRoadStatus;
  String? _selectedIncome;
  String? _selectedTrust;
  String? _selectedPoliticalClimate;
  String? _selectedSocialPriority;
  String? _selectedInvestmentAcceptance;
  String? _selectedMineReopening;

  // Checkbox/Multi-select Lists
  final List<String> _selectedWomenRoles = [];
  final List<String> _selectedMineBenefits = [];
  final List<String> _selectedMineRisks = [];

  // Options Definitions
  final List<Map<String, String>> _sectors = [
    {'value': 'centro', 'label': 'Centro Parroquial'},
    {'value': 'deleg', 'label': 'La Deleg'},
    {'value': 'sallac', 'label': 'Sallac'},
    {'value': 'pishio', 'label': 'Pishio'},
  ];

  final List<String> _genders = ['Mujer', 'Hombre', 'Otro'];
  final List<String> _ageRanges = ['18-25', '26-35', '36-45', '46-60', '61 o mas'];
  final List<String> _educationLevels = ['Primaria', 'Secundaria', 'Tecnico', 'Universitario', 'Ninguno'];
  
  final List<String> _problems = [
    'Inseguridad',
    'Falta de empleo',
    'Agua y saneamiento',
    'Vias en mal estado',
    'Salud',
    'Migracion juvenil'
  ];

  final List<String> _youthPaths = [
    'Migracion por falta de oportunidades',
    'Agricultura o trabajo informal',
    'Continuan estudios superiores',
    'Empleo local eventual'
  ];

  final List<String> _womenRolesOptions = [
    'Precios bajos por intermediarios',
    'Sobrecarga de cuidados',
    'Poco acceso a financiamiento',
    'Mercados limitados'
  ];

  final List<String> _waterSources = [
    'Red publica con tratamiento',
    'Vertiente comunal sin purificacion',
    'Rio o acequia',
    'Tanquero u otra compra'
  ];

  final List<String> _sewerOptions = ['Si tiene', 'No tiene'];
  
  final List<String> _internetOptions = ['Si estable', 'Intermitente', 'No tiene'];
  
  final List<String> _roadStatusOptions = ['Bueno', 'Regular', 'Malo'];
  
  final List<String> _incomeOptions = [
    'No cubre la canasta',
    'Cubre apenas',
    'Cubre con algo de holgura'
  ];

  final List<String> _trustOptions = ['Alta', 'Media', 'Baja'];

  final List<String> _politicalClimates = [
    'Desconfianza institucional',
    'Division comunitaria',
    'Estabilidad relativa',
    'Conflicto abierto entre actores'
  ];

  final List<String> _socialPriorities = [
    'Proteger agua y paramos',
    'Generar empleo rapido',
    'Mejorar vias y servicios',
    'Fortalecer produccion local'
  ];

  final List<String> _investmentAcceptances = [
    'Rechazo preventivo',
    'Aceptacion condicionada',
    'Aceptacion amplia'
  ];

  final List<String> _mineReopenings = [
    'Beneficiaria mucho',
    'Beneficiaria algo',
    'Beneficio dudoso',
    'No beneficiaria'
  ];

  final List<String> _mineBenefitsOptions = [
    'Empleo juvenil',
    'Movimiento comercial',
    'Obras comunitarias',
    'Ninguno claro'
  ];

  final List<String> _mineRisksOptions = [
    'Contaminacion del agua',
    'Danos al suelo',
    'Conflicto social',
    'Poca transparencia'
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _syncUserProfile();
    _loadOfflineSurveys();
    _fetchMySurveys();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _communityController.dispose();
    _occupationController.dispose();
    _commentsController.dispose();
    _latitudeController.dispose();
    _longitudeController.dispose();
    super.dispose();
  }

  Future<void> _syncUserProfile() async {
    setState(() {
      _isSyncingUser = true;
      _syncError = null;
    });

    try {
      await widget.apiService.bootstrap();
    } catch (e) {
      final errMsg = e.toString();
      if (errMsg.contains('Sesion no autenticada') || errMsg.contains('unauthenticated') || !widget.apiService.isLoggedIn) {
        if (mounted) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (context) => LoginScreen(apiService: widget.apiService)),
              );
            }
          });
          return;
        }
      }
      setState(() {
        _syncError = errMsg.replaceAll('Exception:', '').trim();
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSyncingUser = false;
        });
      }
    }
  }

  // Carga las encuestas guardadas localmente offline en SharedPreferences
  void _loadOfflineSurveys() {
    final raw = widget.apiService.prefs.getString('offline_surveys_drafts');
    if (raw != null) {
      try {
        final List<dynamic> decoded = jsonDecode(raw);
        setState(() {
          _offlineSurveys = decoded.map((e) => Map<String, dynamic>.from(e)).toList();
        });
      } catch (_) {}
    }
  }

  // Guarda la cola offline en SharedPreferences
  Future<void> _saveOfflineSurveys() async {
    await widget.apiService.prefs.setString('offline_surveys_drafts', jsonEncode(_offlineSurveys));
  }

  // Obtiene el historial de encuestas subidas
  Future<void> _fetchMySurveys() async {
    if (!widget.apiService.isLoggedIn || widget.apiService.currentUser?['account_status'] != 'approved') {
      return;
    }

    setState(() {
      _isFetchingMySurveys = true;
    });

    try {
      final List<dynamic> surveys = await widget.apiService.mySurveys();
      setState(() {
        _mySurveys = surveys;
      });
    } catch (_) {
      // Mantenemos listado actual si falla la red
    } finally {
      if (mounted) {
        setState(() {
          _isFetchingMySurveys = false;
        });
      }
    }
  }

  // Captura de GPS satelital con alta precisión
  Future<void> _captureGps() async {
    setState(() {
      _isCapturingGps = true;
      _gpsStatus = 'Capturando señal GPS...';
    });

    try {
      final position = await GpsService.determinePosition();
      setState(() {
        _latitudeController.text = position.latitude.toStringAsFixed(7);
        _longitudeController.text = position.longitude.toStringAsFixed(7);
        _gpsStatus = 'GPS Capturado con éxito (Precisión: +/- ${position.accuracy.toStringAsFixed(1)}m)';
      });
    } catch (e) {
      setState(() {
        _gpsStatus = 'Error GPS: ${e.toString().replaceAll('Exception:', '').trim()}';
      });
    } finally {
      setState(() {
        _isCapturingGps = false;
      });
    }
  }

  // Genera un UUID de 32 caracteres único localmente
  String _generateLocalUuid() {
    final now = DateTime.now().microsecondsSinceEpoch.toString();
    final rand = List.generate(10, (i) => '0123456789abcdef'[DateTime.now().microsecondsSinceEpoch % 16]).join();
    return (now + rand).padRight(32, 'f').substring(0, 32);
  }

  // Módulo de envío directo simplificado vía ApiService

  // Guarda y envía la encuesta actual
  Future<void> _handleSaveSurvey() async {
    setState(() {
      _surveyError = null;
    });

    if (!_formKey.currentState!.validate()) {
      setState(() {
        _surveyError = 'Por favor revisa los campos requeridos en el formulario.';
      });
      return;
    }

    if (_selectedSector == null) {
      setState(() {
        _surveyError = 'Debes seleccionar el sector en monitoreo.';
      });
      return;
    }

    if (_selectedGender == null) {
      setState(() {
        _surveyError = 'Debes seleccionar el género.';
      });
      return;
    }

    if (_selectedAgeRange == null) {
      setState(() {
        _surveyError = 'Debes seleccionar el rango de edad.';
      });
      return;
    }

    if (_selectedProblem == null) {
      setState(() {
        _surveyError = 'Debes indicar la problemática principal.';
      });
      return;
    }

    if (_selectedYouthPath == null) {
      setState(() {
        _surveyError = 'Debes indicar el destino de los jóvenes.';
      });
      return;
    }

    if (_selectedWaterSource == null) {
      setState(() {
        _surveyError = 'Debes indicar la fuente de agua.';
      });
      return;
    }

    if (_selectedSewer == null) {
      setState(() {
        _surveyError = 'Debes indicar la condición de alcantarillado.';
      });
      return;
    }

    if (_selectedPoliticalClimate == null) {
      setState(() {
        _surveyError = 'Debes indicar el clima político.';
      });
      return;
    }

    if (_selectedSocialPriority == null) {
      setState(() {
        _surveyError = 'Debes indicar la prioridad territorial.';
      });
      return;
    }

    if (_selectedInvestmentAcceptance == null) {
      setState(() {
        _surveyError = 'Debes indicar la aceptación de inversión externa.';
      });
      return;
    }

    if (_selectedMineReopening == null) {
      setState(() {
        _surveyError = 'Debes indicar la percepción de reapertura.';
      });
      return;
    }

    setState(() {
      _isSubmittingSurvey = true;
    });

    final clientUuid = _generateLocalUuid();
    final newSurvey = {
      'client_uuid': clientUuid,
      'sector': _selectedSector,
      'community': _communityController.text.trim(),
      'survey_date': DateTime.now().toIso8601String().replaceAll('T', ' ').substring(0, 19),
      'survey_status': 'sincronizada',
      'surveyor_id': widget.apiService.currentUser?['surveyor_id']?.toString() ?? '0',
      'surveyor_name': widget.apiService.currentUser?['display_name'] ?? '',
      'respondent_gender': _selectedGender,
      'age_range': _selectedAgeRange,
      'education_level': _selectedEducation ?? '',
      'occupation': _occupationController.text.trim(),
      'primary_problem': _selectedProblem,
      'youth_path': _selectedYouthPath,
      'women_roles': List<String>.from(_selectedWomenRoles),
      'water_source': _selectedWaterSource,
      'has_sewer': _selectedSewer,
      'has_internet': _selectedInternet ?? '',
      'road_status': _selectedRoadStatus ?? '',
      'household_income': _selectedIncome ?? '',
      'political_climate': _selectedPoliticalClimate,
      'authority_trust': _selectedTrust ?? '',
      'social_priority': _selectedSocialPriority,
      'investment_acceptance': _selectedInvestmentAcceptance,
      'mine_reopening_perception': _selectedMineReopening,
      'mine_benefits': List<String>.from(_selectedMineBenefits),
      'mine_risks': List<String>.from(_selectedMineRisks),
      'comments': _commentsController.text.trim(),
      'latitude': _latitudeController.text.trim(),
      'longitude': _longitudeController.text.trim(),
    };

    try {
      // Preparamos payload en JSON limpio
      final Map<String, dynamic> surveyPayload = Map<String, dynamic>.from(newSurvey);
      surveyPayload['women_roles'] = _selectedWomenRoles.join('|');
      surveyPayload['mine_benefits'] = _selectedMineBenefits.join('|');
      surveyPayload['mine_risks'] = _selectedMineRisks.join('|');

      // Intentamos subirla directamente por red usando ApiService
      await widget.apiService.saveSurvey(surveyPayload);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('¡Encuesta enviada y guardada con éxito!'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
      }
      _fetchMySurveys(); // Refrescamos historial remoto
    } catch (_) {
      // Si falla, se guarda automáticamente en la cola offline local
      newSurvey['survey_status'] = 'pendiente_sincronizacion';
      setState(() {
        _offlineSurveys.add(newSurvey);
      });
      await _saveOfflineSurveys();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Guardado en la cola local. Se subirá automáticamente al recuperar internet.'),
            backgroundColor: Color(0xFFF59E0B),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSubmittingSurvey = false;
          _isSurveyActive = false;
        });
        _clearForm();
      }
    }
  }

  // Limpia el formulario tras guardar
  void _clearForm() {
    _communityController.clear();
    _occupationController.clear();
    _commentsController.clear();
    _latitudeController.clear();
    _longitudeController.clear();
    setState(() {
      _selectedSector = null;
      _selectedGender = null;
      _selectedAgeRange = null;
      _selectedEducation = null;
      _selectedProblem = null;
      _selectedYouthPath = null;
      _selectedWaterSource = null;
      _selectedSewer = null;
      _selectedInternet = null;
      _selectedRoadStatus = null;
      _selectedIncome = null;
      _selectedTrust = null;
      _selectedPoliticalClimate = null;
      _selectedSocialPriority = null;
      _selectedInvestmentAcceptance = null;
      _selectedMineReopening = null;
      _selectedWomenRoles.clear();
      _selectedMineBenefits.clear();
      _selectedMineRisks.clear();
      _gpsStatus = null;
    });
  }

  // Sincroniza la cola local de encuestas pendientes
  Future<void> _syncOfflineSurveys() async {
    if (_offlineSurveys.isEmpty) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Sincronizando encuestas locales...')),
    );

    final failed = <Map<String, dynamic>>[];
    try {
      // Enviamos el lote completo al endpoint de sincronización
      await widget.apiService.syncSurveys(_offlineSurveys);
    } catch (_) {
      // Si la sincronización por lote falla, guardamos todas como pendientes
      failed.addAll(_offlineSurveys);
    }

    setState(() {
      _offlineSurveys = failed;
    });
    await _saveOfflineSurveys();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(failed.isEmpty 
              ? '¡Sincronización de cola completada con éxito!' 
              : 'Se sincronizaron algunas encuestas, pero quedaron ${failed.length} pendientes.'),
          backgroundColor: failed.isEmpty ? const Color(0xFF10B981) : const Color(0xFFEF4444),
        ),
      );
    }
  }

  // Método de Logout (Cerrar Sesión)
  Future<void> _handleLogout() async {
    await widget.apiService.logout();
    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => LoginScreen(apiService: widget.apiService)),
      );
    }
  }

  // Genera un widget visual para cada sección del formulario de encuesta
  Widget _buildSectionCard({required String title, required List<Widget> children}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF334155), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.white,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    );
  }

  // Genera el listado de opciones de tipo Checkbox para selección múltiple
  Widget _buildMultiSelectChips({
    required List<String> options,
    required List<String> selectedList,
  }) {
    return Wrap(
      spacing: 8.0,
      runSpacing: 8.0,
      children: options.map((opt) {
        final isSelected = selectedList.contains(opt);
        return FilterChip(
          label: Text(opt),
          selected: isSelected,
          onSelected: (selected) {
            setState(() {
              if (selected) {
                selectedList.add(opt);
              } else {
                selectedList.remove(opt);
              }
            });
          },
          backgroundColor: const Color(0xFF0F172A),
          selectedColor: const Color(0xFF3B82F6).withOpacity(0.3),
          checkmarkColor: const Color(0xFF3B82F6),
          labelStyle: TextStyle(
            color: isSelected ? Colors.white : const Color(0xFF94A3B8),
            fontSize: 13,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: BorderSide(
              color: isSelected ? const Color(0xFF3B82F6) : const Color(0xFF334155),
              width: 1,
            ),
          ),
        );
      }).toList(),
    );
  }

  // --- INTERFAZ BLOQUEADA (ESTADOS ADMINISTRATIVOS) ---
  Widget _buildBlockedStateScreen({
    required IconData icon,
    required Color color,
    required String title,
    required String message,
    String? adminNotes,
    bool showRefresh = true,
  }) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF0F172A), Color(0xFF020617)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 32.0, vertical: 24.0),
        alignment: Alignment.center,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                shape: BoxShape.circle,
                border: Border.all(color: color.withOpacity(0.3), width: 2),
              ),
              child: Icon(icon, color: color, size: 64),
            ),
            const SizedBox(height: 28),
            Text(
              title,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.white,
                letterSpacing: -0.5,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              message,
              style: const TextStyle(
                fontSize: 15,
                color: Color(0xFF94A3B8),
                height: 1.5,
              ),
              textAlign: TextAlign.center,
            ),
            if (adminNotes != null && adminNotes.isNotEmpty) ...[
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF334155)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Observaciones de Administración:',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      adminNotes,
                      style: const TextStyle(
                        color: Color(0xFFEF4444),
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 48),
            if (_isSyncingUser)
              const CircularProgressIndicator(valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF3B82F6)))
            else ...[
              if (showRefresh) ...[
                ElevatedButton.icon(
                  onPressed: _syncUserProfile,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Refrescar Estado'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF3B82F6),
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                  ),
                ),
                const SizedBox(height: 14),
              ],
              TextButton.icon(
                onPressed: _handleLogout,
                icon: const Icon(Icons.logout, color: Color(0xFFEF4444)),
                label: const Text('Cerrar Sesión', style: TextStyle(color: Color(0xFFEF4444))),
              ),
            ],
            if (_syncError != null) ...[
              const SizedBox(height: 20),
              Text(
                'Error de sincronización: $_syncError',
                style: const TextStyle(color: Color(0xFFEF4444), fontSize: 12),
                textAlign: TextAlign.center,
              ),
            ]
          ],
        ),
      ),
    );
  }

  Widget _buildDashboardPanel(Map<String, dynamic> user) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Tarjeta de Bienvenida
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF1E293B), Color(0xFF0F172A)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF334155), width: 1),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF3B82F6).withOpacity(0.1),
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFF3B82F6).withOpacity(0.3), width: 1.5),
                  ),
                  child: const Icon(Icons.waving_hand_outlined, color: Color(0xFF3B82F6), size: 28),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '¡Hola, ${user['display_name'] ?? 'Encuestador'}!',
                        style: const TextStyle(
                          fontFamily: 'Outfit',
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Bienvenido a tu panel de control.',
                        style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Tarjeta Principal de Acción: INICIAR ENCUESTA
          InkWell(
            onTap: () {
              setState(() {
                _isSurveyActive = true;
              });
            },
            borderRadius: BorderRadius.circular(20),
            child: Ink(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF2563EB), Color(0xFF1D4ED8)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF2563EB).withOpacity(0.35),
                    blurRadius: 16,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.15),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.assignment_add,
                          color: Colors.white,
                          size: 28,
                        ),
                      ),
                      const Icon(
                        Icons.arrow_forward_ios,
                        color: Colors.white70,
                        size: 16,
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'Iniciar Encuesta',
                    style: TextStyle(
                      fontFamily: 'Outfit',
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Registra una nueva ficha territorial de campo. Se capturarán datos de vivienda, percepción social y coordenadas GPS.',
                    style: TextStyle(
                      color: const Color(0xFFE2E8F0),
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Fila de Estadísticas Rápidas
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFF334155), width: 1),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF10B981).withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.cloud_done, color: Color(0xFF10B981), size: 16),
                      ),
                      const SizedBox(height: 12),
                      _isFetchingMySurveys
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 1.5, valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF3B82F6))),
                            )
                          : Text(
                              '${_mySurveys.length}',
                              style: const TextStyle(
                                fontFamily: 'Outfit',
                                fontSize: 24,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                      const SizedBox(height: 2),
                      const Text(
                        'Sincronizadas',
                        style: TextStyle(color: const Color(0xFF94A3B8), fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFF334155), width: 1),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF59E0B).withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.cloud_upload_outlined, color: Color(0xFFF59E0B), size: 16),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        '${_offlineSurveys.length}',
                        style: const TextStyle(
                          fontFamily: 'Outfit',
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Cola Offline',
                        style: TextStyle(color: const Color(0xFF94A3B8), fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Detalles de Operación
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF334155), width: 1),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: const [
                        Icon(Icons.location_on_outlined, color: Color(0xFF3B82F6), size: 18),
                        SizedBox(width: 8),
                        Text('Zona Asignada', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13)),
                      ],
                    ),
                    Text(
                      user['assigned_zone'] ?? 'San Bartolomé',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                const Divider(color: Color(0xFF334155), height: 1),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: const [
                        Icon(Icons.badge_outlined, color: Color(0xFF3B82F6), size: 18),
                        SizedBox(width: 8),
                        Text('Rol Operativo', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13)),
                      ],
                    ),
                    const Text(
                      'Encuestador de Campo',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  // --- PANTALLAS DE ACUERDO AL ESTADO ---
  @override
  Widget build(BuildContext context) {
    final user = widget.apiService.currentUser;
    if (user == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => LoginScreen(apiService: widget.apiService)),
          );
        }
      });
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF3B82F6)),
          ),
        ),
      );
    }

    final status = user['account_status'] ?? 'pending';

    if (status == 'pending') {
      return _buildBlockedStateScreen(
        icon: Icons.hourglass_empty,
        color: const Color(0xFFF59E0B),
        title: 'Postulación en Revisión',
        message: 'Hola ${user['display_name']}. Tu ficha de postulación de encuestador ha sido registrada correctamente. Actualmente se encuentra bajo revisión administrativa para habilitar tu cuenta de campo.',
      );
    }

    if (status == 'rejected') {
      return _buildBlockedStateScreen(
        icon: Icons.cancel_outlined,
        color: const Color(0xFFEF4444),
        title: 'Postulación Rechazada',
        message: 'Lo sentimos, tu solicitud para unirte como encuestador no ha sido aprobada por la administración del sistema.',
        adminNotes: user['review_notes'] ?? 'No se indicaron detalles adicionales.',
      );
    }

    if (status == 'suspended') {
      return _buildBlockedStateScreen(
        icon: Icons.gavel_outlined,
        color: const Color(0xFFEF4444),
        title: 'Cuenta Suspendida',
        message: 'Tu cuenta operativa de encuestador ha sido temporalmente suspendida por la administración del sistema. Por favor comunícate con soporte.',
      );
    }

    // --- INTERFAZ ACTIVA APROBADA (WORKSPACE) ---
    return Scaffold(
      appBar: AppBar(
        title: const Text('Workspace de Campo'),
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
        actions: [
          if (_offlineSurveys.isNotEmpty)
            IconButton(
              icon: Badge(
                label: Text(_offlineSurveys.length.toString()),
                child: const Icon(Icons.cloud_upload_outlined, color: Color(0xFFF59E0B)),
              ),
              tooltip: 'Sincronizar encuestas locales',
              onPressed: _syncOfflineSurveys,
            ),
          IconButton(
            icon: const Icon(Icons.logout, color: Color(0xFFEF4444)),
            onPressed: _handleLogout,
            tooltip: 'Salir',
          )
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: const Color(0xFF3B82F6),
          labelColor: Colors.white,
          unselectedLabelColor: const Color(0xFF64748B),
          tabs: const [
            Tab(icon: Icon(Icons.edit_note), text: 'Levantar Encuesta'),
            Tab(icon: Icon(Icons.person_pin), text: 'Perfil & Cola'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // TAB 1: DASHBOARD O FORMULARIO
          !_isSurveyActive
              ? _buildDashboardPanel(user)
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(24.0),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Botón para regresar al panel
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            onPressed: () {
                              setState(() {
                                _isSurveyActive = false;
                              });
                            },
                            icon: const Icon(Icons.arrow_back, color: Color(0xFF3B82F6), size: 20),
                            label: const Text(
                              'Regresar al Panel',
                              style: TextStyle(color: Color(0xFF3B82F6), fontSize: 14, fontWeight: FontWeight.w600),
                            ),
                            style: TextButton.styleFrom(
                              padding: EdgeInsets.zero,
                              minimumSize: const Size(50, 30),
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'Nueva Ficha Territorial',
                          style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Realiza el levantamiento social. Recuerda capturar las coordenadas GPS obligatoriamente.',
                          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                        ),
                        const SizedBox(height: 24),

                  // Sección 1: Identificación y Contexto
                  _buildSectionCard(
                    title: 'Identificación y Contexto',
                    children: [
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Sector en monitoreo *'),
                        value: _selectedSector,
                        items: _sectors.map((sec) {
                          return DropdownMenuItem<String>(
                            value: sec['value'],
                            child: Text(sec['label']!),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedSector = val),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _communityController,
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(
                          labelText: 'Comunidad o Barrio *',
                          hintText: 'Ej. Centro, San Vicente...',
                        ),
                        validator: (value) => value!.trim().isEmpty ? 'Comunidad es obligatoria.' : null,
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Género de encuestado *'),
                        value: _selectedGender,
                        items: _genders.map((gen) {
                          return DropdownMenuItem<String>(
                            value: gen,
                            child: Text(gen),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedGender = val),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Rango de Edad *'),
                        value: _selectedAgeRange,
                        items: _ageRanges.map((age) {
                          return DropdownMenuItem<String>(
                            value: age,
                            child: Text(age),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedAgeRange = val),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Nivel Educativo'),
                        value: _selectedEducation,
                        items: _educationLevels.map((edu) {
                          return DropdownMenuItem<String>(
                            value: edu,
                            child: Text(edu),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedEducation = val),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _occupationController,
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(
                          labelText: 'Ocupación Principal *',
                          hintText: 'Ej. Agricultor, Ama de casa...',
                        ),
                        validator: (value) => value!.trim().isEmpty ? 'Ocupación es obligatoria.' : null,
                      ),
                    ],
                  ),

                  // Sección 2: Problemáticas y Dinámica Social
                  _buildSectionCard(
                    title: 'Problemáticas y Dinámica Social',
                    children: [
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Problemática principal *'),
                        value: _selectedProblem,
                        items: _problems.map((prob) {
                          return DropdownMenuItem<String>(
                            value: prob,
                            child: Text(prob),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedProblem = val),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Destino principal de jóvenes *'),
                        value: _selectedYouthPath,
                        items: _youthPaths.map((path) {
                          return DropdownMenuItem<String>(
                            value: path,
                            child: Text(path),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedYouthPath = val),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Limitaciones económicas frecuentes para mujeres:',
                        style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      _buildMultiSelectChips(
                        options: _womenRolesOptions,
                        selectedList: _selectedWomenRoles,
                      ),
                    ],
                  ),

                  // Sección 3: Condiciones del Hogar
                  _buildSectionCard(
                    title: 'Condiciones de Hogar y Validación',
                    children: [
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Fuente principal de agua *'),
                        value: _selectedWaterSource,
                        items: _waterSources.map((source) {
                          return DropdownMenuItem<String>(
                            value: source,
                            child: Text(source),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedWaterSource = val),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: '¿Tiene alcantarillado? *'),
                        value: _selectedSewer,
                        items: _sewerOptions.map((sew) {
                          return DropdownMenuItem<String>(
                            value: sew,
                            child: Text(sew),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedSewer = val),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Conectividad a Internet'),
                        value: _selectedInternet,
                        items: _internetOptions.map((net) {
                          return DropdownMenuItem<String>(
                            value: net,
                            child: Text(net),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedInternet = val),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Estado de vías'),
                        value: _selectedRoadStatus,
                        items: _roadStatusOptions.map((road) {
                          return DropdownMenuItem<String>(
                            value: road,
                            child: Text(road),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedRoadStatus = val),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Ingresos del hogar'),
                        value: _selectedIncome,
                        items: _incomeOptions.map((inc) {
                          return DropdownMenuItem<String>(
                            value: inc,
                            child: Text(inc),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedIncome = val),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Confianza en autoridades'),
                        value: _selectedTrust,
                        items: _trustOptions.map((tru) {
                          return DropdownMenuItem<String>(
                            value: tru,
                            child: Text(tru),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedTrust = val),
                      ),
                    ],
                  ),

                  // Sección 4: Clima Político y Percepción Territorial
                  _buildSectionCard(
                    title: 'Clima Político y Percepción',
                    children: [
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Manejo político local *'),
                        value: _selectedPoliticalClimate,
                        items: _politicalClimates.map((cli) {
                          return DropdownMenuItem<String>(
                            value: cli,
                            child: Text(cli),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedPoliticalClimate = val),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Prioridad ante inversión externa *'),
                        value: _selectedSocialPriority,
                        items: _socialPriorities.map((prio) {
                          return DropdownMenuItem<String>(
                            value: prio,
                            child: Text(prio),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedSocialPriority = val),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Aceptación de proyectos externos *'),
                        value: _selectedInvestmentAcceptance,
                        items: _investmentAcceptances.map((acc) {
                          return DropdownMenuItem<String>(
                            value: acc,
                            child: Text(acc),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedInvestmentAcceptance = val),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        dropdownColor: const Color(0xFF1E293B),
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Percepción reapertura Silver 1 *'),
                        value: _selectedMineReopening,
                        items: _mineReopenings.map((mine) {
                          return DropdownMenuItem<String>(
                            value: mine,
                            child: Text(mine),
                          );
                        }).toList(),
                        onChanged: (val) => setState(() => _selectedMineReopening = val),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Beneficios esperados:',
                        style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      _buildMultiSelectChips(
                        options: _mineBenefitsOptions,
                        selectedList: _selectedMineBenefits,
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Riesgos más temidos:',
                        style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      _buildMultiSelectChips(
                        options: _mineRisksOptions,
                        selectedList: _selectedMineRisks,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _commentsController,
                        style: const TextStyle(color: Colors.white),
                        maxLines: 3,
                        decoration: const InputDecoration(
                          labelText: 'Observaciones Adicionales',
                          hintText: 'Añade comentarios o detalles del campo...',
                          alignLabelWithHint: true,
                        ),
                      ),
                    ],
                  ),

                  // Sección 5: Geolocalización Satelital (GPS)
                  _buildSectionCard(
                    title: 'Geolocalización Satelital (GPS)',
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              controller: _latitudeController,
                              readOnly: true,
                              style: const TextStyle(color: Colors.white),
                              decoration: const InputDecoration(labelText: 'Latitud'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              controller: _longitudeController,
                              readOnly: true,
                              style: const TextStyle(color: Colors.white),
                              decoration: const InputDecoration(labelText: 'Longitud'),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      if (_gpsStatus != null) ...[
                        Text(
                          _gpsStatus!,
                          style: TextStyle(
                            color: _gpsStatus!.contains('Error') 
                                ? const Color(0xFFEF4444) 
                                : const Color(0xFF10B981),
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 12),
                      ],
                      ElevatedButton.icon(
                        onPressed: _isCapturingGps ? null : _captureGps,
                        icon: _isCapturingGps 
                            ? const SizedBox(
                                width: 18, 
                                height: 18, 
                                child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation<Color>(Colors.white))
                              )
                            : const Icon(Icons.gps_fixed),
                        label: const Text('Capturar Ubicación GPS'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0F172A),
                          side: const BorderSide(color: Color(0xFF3B82F6), width: 1),
                        ),
                      ),
                    ],
                  ),

                  // Mostrar error del formulario
                  if (_surveyError != null) ...[
                    Container(
                      margin: const EdgeInsets.only(bottom: 20),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEF4444).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.3)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline, color: Color(0xFFEF4444), size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _surveyError!,
                              style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],

                        // Guardar
                        ElevatedButton(
                          onPressed: _isSubmittingSurvey ? null : _handleSaveSurvey,
                          child: _isSubmittingSurvey
                              ? const CircularProgressIndicator(valueColor: AlwaysStoppedAnimation<Color>(Colors.white))
                              : const Text('Guardar Encuesta'),
                        ),
                        const SizedBox(height: 32),
                      ],
                    ),
                  ),
                ),

          // TAB 2: MI PERFIL Y COLA OFFLINE
          SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Tarjeta de Perfil
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFF334155)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: const BoxDecoration(
                              color: Color(0xFF3B82F6),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.person, color: Colors.white, size: 28),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  user['display_name'] ?? 'Encuestador',
                                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
                                ),
                                Text(
                                  '@${user['username']}',
                                  style: const TextStyle(color: Color(0xFF64748B), fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: const Color(0xFF10B981).withOpacity(0.1),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: const Color(0xFF10B981)),
                            ),
                            child: const Text(
                              'APROBADO',
                              style: TextStyle(color: Color(0xFF10B981), fontSize: 10, fontWeight: FontWeight.bold),
                            ),
                          )
                        ],
                      ),
                      const SizedBox(height: 20),
                      const Divider(color: Color(0xFF334155)),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Zona de Trabajo Asignada:', style: TextStyle(color: Color(0xFF94A3B8))),
                          Text(
                            user['assigned_zone'] ?? 'San Bartolomé',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Encuestas Sincronizadas:', style: TextStyle(color: Color(0xFF94A3B8))),
                          _isFetchingMySurveys
                              ? const SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF3B82F6))),
                                )
                              : Text(
                                  '${_mySurveys.length}',
                                  style: const TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold),
                                ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Cola Offline
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Cola Offline (${_offlineSurveys.length})',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                    if (_offlineSurveys.isNotEmpty)
                      TextButton.icon(
                        onPressed: _syncOfflineSurveys,
                        icon: const Icon(Icons.sync, size: 18),
                        label: const Text('Sincronizar Ahora'),
                      )
                  ],
                ),
                const SizedBox(height: 12),

                if (_offlineSurveys.isEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F172A),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFF334155), style: BorderStyle.solid),
                    ),
                    child: Column(
                      children: const [
                        Icon(Icons.cloud_done_outlined, color: Color(0xFF64748B), size: 40),
                        const SizedBox(height: 12),
                        Text(
                          'No tienes encuestas pendientes de subir.',
                          style: TextStyle(color: Color(0xFF64748B), fontSize: 13),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  )
                else
                  ListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _offlineSurveys.length,
                    itemBuilder: (context, index) {
                      final item = _offlineSurveys[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: ListTile(
                          leading: const Icon(Icons.pending_actions, color: Color(0xFFF59E0B)),
                          title: Text(
                            item['community'] ?? 'Comunidad sin nombre',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                          ),
                          subtitle: Text(
                            'Sector: ${item['sector']} | Lat: ${item['latitude']} Lng: ${item['longitude']}',
                            style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
                          ),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline, color: Color(0xFFEF4444)),
                            onPressed: () {
                              setState(() {
                                _offlineSurveys.removeAt(index);
                              });
                              _saveOfflineSurveys();
                            },
                          ),
                        ),
                      );
                    },
                  ),
                const SizedBox(height: 24),
              ],
            ),
          )
        ],
      ),
    );
  }
}
