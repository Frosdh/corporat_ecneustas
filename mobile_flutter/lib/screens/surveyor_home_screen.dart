import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../services/api_service.dart';
import '../services/gps_service.dart';
import '../theme/coffee_palette.dart';
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
  bool _isGpsLoadingForSurvey = false; // true mientras el GPS carga al abrir la encuesta
  String? _syncError;
  String? _surveyError;
  String? _gpsStatus;
  
  List<dynamic> _mySurveys = [];
  List<Map<String, dynamic>> _offlineSurveys = [];

  // GPS en segundo plano y detección geográfica
  StreamSubscription<Position>? _gpsSubscription;
  Position? _latestPosition;
  String? _inferredLocationDetails;

  // Form Key & Controllers
  final _formKey = GlobalKey<FormState>();
  final _communityController = TextEditingController();
  final _namesController = TextEditingController();
  final _lastNamesController = TextEditingController();
  final _idDocumentController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _occupationController = TextEditingController();
  final _commentsController = TextEditingController();
  final _latitudeController = TextEditingController();
  final _longitudeController = TextEditingController();
  final _dateController = TextEditingController();
  final _surveyorController = TextEditingController();
  // Campo libre para "Otro" en la pregunta de destino de jóvenes
  final _youthPathOtherController = TextEditingController();
  String? _selectedRoadWhoFixes;

  // Dropdown Form Values
  String? _selectedSector;
  String? _selectedGender;
  String? _selectedAgeRange;
  String? _selectedEducation;
  final List<String> _selectedProblems = [];
  String? _selectedYouthPath;
  String? _selectedWaterSource;
  String? _selectedSewer;
  String? _selectedSeptic;
  String? _selectedInternet;
  String? _selectedRoadStatus;
  String? _selectedIncome;
  String? _selectedTrust;
  String? _selectedPoliticalClimate;
  final List<String> _selectedSocialPriorities = [];
  String? _selectedInvestmentAcceptance;
  String? _selectedMineReopening;

  // New Dropdown Form Values for Mining Questions
  String? _selectedMiningTypes;
  String? _selectedMiningBenefits;
  String? _selectedModernMining;
  String? _selectedLocalMines;
  String? _selectedEnvGuarantees;

  // Checkbox/Multi-select Lists
  String? _selectedWomenRoles;
  final List<String> _selectedMineBenefits = [];
  final List<String> _selectedMineRisks = [];

  // Options Definitions


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
    'Empleo local eventual',
    'Otro'
  ];

  final List<String> _womenRolesOptions = [
    'Precios bajos por intermediarios',
    'Sobrecarga de cuidados',
    'Poco acceso a financiamiento',
    'Mercados limitados por seleccion'
  ];

  final List<String> _waterSources = [
    'Red publica con tratamiento',
    'Vertiente comunal sin purificacion',
    'Rio o acequia',
    'Tanquero u otra compra'
  ];

  final List<String> _sewerOptions = ['Si tiene', 'No tiene'];
  final List<String> _septicOptions = ['Si tiene', 'No tiene'];
  
  final List<String> _internetOptions = ['Si estable', 'Intermitente', 'No tiene'];
  final List<String> _roadWhoFixesOptions = ['GAD Parroquial', 'GAD Cantonal', 'GAD Provincial'];
  
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
    'Fortalecer produccion local',
    'Turismo',
    'Viviendas',
    'Mineria?'
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
    'Pago de impuestos',
    'Ninguno claro'
  ];

  final List<String> _mineRisksOptions = [
    'Contaminacion del agua',
    'Danos al suelo',
    'Conflicto social',
    'Poca transparencia'
  ];

  // Options for new questions
  final List<String> _miningTypesOptions = ['Si', 'No', 'Primera vez que escucho'];
  final List<String> _miningBenefitsOptions = ['Si', 'No', 'Primera vez que escucho'];
  final List<String> _modernMiningOptions = ['Si', 'No', 'Primera vez que escucho esto'];
  final List<String> _localMinesOptions = ['Si', 'No', 'Hay que investigar'];
  final List<String> _envGuaranteesOptions = ['Si', 'No', 'Asi debería ser'];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _dateController.text = DateTime.now().toIso8601String().replaceAll('T', ' ').substring(0, 16);
    _surveyorController.text = widget.apiService.currentUser?['display_name'] ?? '';
    _syncUserProfile();
    _loadOfflineSurveys();
    _fetchMySurveys();
    _startBackgroundGpsListener();
  }

  @override
  void dispose() {
    _gpsSubscription?.cancel();
    _tabController.dispose();
    _communityController.dispose();
    _namesController.dispose();
    _lastNamesController.dispose();
    _idDocumentController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _occupationController.dispose();
    _commentsController.dispose();
    _latitudeController.dispose();
    _longitudeController.dispose();
    _dateController.dispose();
    _surveyorController.dispose();
    _youthPathOtherController.dispose();
    super.dispose();
  }

  // ─────────────────────────────────────────────────────────────
  // Aplica los datos de ubicación a la interfaz de manera uniforme.
  // Llama a getFullLocationInfo() que combina geocodificación inversa
  // real (barrio del geocoder) + lista de referencia (sector).
  // ─────────────────────────────────────────────────────────────
  Future<void> _applyLocationToForm(Position position, {bool forceUpdate = false}) async {
    // Obtener sector (por distancia a lista de referencia) Y barrio real (geocoder)
    final locationInfo = await GpsService.getFullLocationInfo(
      position.latitude,
      position.longitude,
    );

    if (!mounted) return;

    setState(() {
      _latestPosition = position;

      if (locationInfo != null) {
        // Banner informativo de ubicación detectada CON INFORMACIÓN REAL DEL GPS
        _inferredLocationDetails =
            'Detectado automáticamente por GPS:\n'
            'Provincia: ${locationInfo.provincia}  |  Cantón: ${locationInfo.canton}\n'
            'Sector: ${locationInfo.sectorLabel}  |  Barrio: ${locationInfo.barrioName}\n'
            'Precisión: ±${position.accuracy.toStringAsFixed(1)} m';

        // Auto-llenar campos del formulario cuando la encuesta está activa
        if (_isSurveyActive) {
          // Coordenadas (siempre actualizar en forceUpdate; solo si vacíos en modo pasivo)
          if (forceUpdate || _latitudeController.text.isEmpty) {
            _latitudeController.text = position.latitude.toStringAsFixed(7);
          }
          if (forceUpdate || _longitudeController.text.isEmpty) {
            _longitudeController.text = position.longitude.toStringAsFixed(7);
          }

          // Sector: detectado por GPS (distancia a puntos de referencia)
          if (forceUpdate || _selectedSector == null) {
            _selectedSector = locationInfo.sectorValue;
          }

          // Barrio: nombre real del geocoder o punto más cercano de referencia
          if (forceUpdate || _communityController.text.isEmpty) {
            _communityController.text = locationInfo.barrioName;
          }
        }
      } else {
        _inferredLocationDetails = 'Ubicación GPS capturada correctamente.';
      }

      _gpsStatus =
          'GPS activo · Precisión: ±${position.accuracy.toStringAsFixed(1)} m';
    });
  }

  // Escucha el GPS en segundo plano desde el inicio para precarga inmediata
  Future<void> _startBackgroundGpsListener() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        if (mounted) {
          setState(() {
            _gpsStatus = 'Servicio de ubicación desactivado en el dispositivo.';
          });
        }
        return;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          if (mounted) {
            setState(() {
              _gpsStatus = 'Permisos de GPS denegados por el usuario.';
            });
          }
          return;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        if (mounted) {
          setState(() {
            _gpsStatus = 'Permisos de GPS denegados permanentemente en ajustes.';
          });
        }
        return;
      }

      // 1. Precarga instantánea: última posición conocida (sin esperar al satélite)
      Geolocator.getLastKnownPosition().then((Position? position) {
        if (position != null && _latestPosition == null && mounted) {
          _applyLocationToForm(position);
        }
      }).catchError((_) {});

      // 2. Posición actual de alta precisión (satelital, más exacta)
      Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      ).then((Position position) {
        if (mounted) _applyLocationToForm(position, forceUpdate: true);
      }).catchError((_) {});

      // 3. Suscripción continua para actualizar en tiempo real mientras se mueve
      _gpsSubscription?.cancel();
      _gpsSubscription = GpsService.getPositionStream().listen(
        (Position position) {
          if (mounted) _applyLocationToForm(position);
        },
        onError: (err) {
          if (mounted) {
            setState(() {
              _gpsStatus = 'Error de flujo GPS: $err';
            });
          }
        },
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          _gpsStatus = 'No se pudo iniciar geolocalización: $e';
        });
      }
    }
  }

  Future<void> _syncUserProfile() async {
    setState(() {
      _isSyncingUser = true;
      _syncError = null;
    });

    try {
      await widget.apiService.bootstrap();
      if (mounted) {
        setState(() {
          _surveyorController.text = widget.apiService.currentUser?['display_name'] ?? '';
        });
      }
    } catch (e) {
      final errMsg = e.toString();
      if (!widget.apiService.isLoggedIn) {
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

  // Captura GPS bloqueante al INICIAR la encuesta (con await completo)
  // Muestra _isGpsLoadingForSurvey=true en los campos de identificación
  Future<void> _captureGpsForSurveyStart() async {
    try {
      final position = await GpsService.determinePosition();
      await _applyLocationToForm(position, forceUpdate: true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _gpsStatus = 'Error GPS: ${e.toString().replaceAll('Exception:', '').trim()}';
          // Si falla el GPS, dejar campos en blanco para que el encuestador los ingrese
        });
      }
    }
  }

  // Captura de GPS satelital con alta precisión, geocodificación inversa y auto-llenado
  Future<void> _captureGps() async {
    setState(() {
      _isCapturingGps = true;
      _gpsStatus = 'Capturando señal GPS y detectando barrio...';
    });

    try {
      final position = await GpsService.determinePosition();
      // Forzar actualización de todos los campos con la posición precisa
      await _applyLocationToForm(position, forceUpdate: true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _gpsStatus = 'Error GPS: ${e.toString().replaceAll('Exception:', '').trim()}';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isCapturingGps = false;
        });
      }
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

    if (_selectedProblems.isEmpty) {
      setState(() {
        _surveyError = 'Debes indicar al menos una problemática principal.';
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

    if (_selectedSocialPriorities.isEmpty) {
      setState(() {
        _surveyError = 'Debes indicar al menos una prioridad territorial.';
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

    if (_selectedMiningTypes == null) {
      setState(() {
        _surveyError = 'Debes responder si conoce de minería subterránea, a cielo abierto o combinada.';
      });
      return;
    }

    if (_selectedMiningBenefits == null) {
      setState(() {
        _surveyError = 'Debes responder si conoce los beneficios de la minería.';
      });
      return;
    }

    if (_selectedModernMining == null) {
      setState(() {
        _surveyError = 'Debes responder si conoce sobre la minería moderna de bajo impacto.';
      });
      return;
    }

    if (_selectedLocalMines == null) {
      setState(() {
        _surveyError = 'Debes responder si su localidad tiene minas que se pueden aprovechar.';
      });
      return;
    }

    if (_selectedEnvGuarantees == null) {
      setState(() {
        _surveyError = 'Debes responder si sabía de las garantías del Ministerio del Ambiente.';
      });
      return;
    }

    setState(() {
      _isSubmittingSurvey = true;
    });

    final clientUuid = _generateLocalUuid();
    final rawDate = _dateController.text.trim();
    // Validamos y formateamos la fecha en YYYY-MM-DD HH:MM:SS
    final formattedDate = rawDate.length == 16 ? '$rawDate:00' : rawDate;

    final newSurvey = {
      'client_uuid': clientUuid,
      'sector': _selectedSector,
      'community': _communityController.text.trim(),
      'survey_date': formattedDate,
      'survey_status': 'sincronizada',
      'surveyor_id': widget.apiService.currentUser?['surveyor_id']?.toString() ?? '0',
      'surveyor_name': _surveyorController.text.trim(),
      'respondent_name': _namesController.text.trim(),
      'respondent_last_name': _lastNamesController.text.trim(),
      'respondent_id_document': _idDocumentController.text.trim(),
      'respondent_email': _emailController.text.trim(),
      'respondent_phone': _phoneController.text.trim(),
      'respondent_gender': _selectedGender,
      'age_range': _selectedAgeRange,
      'education_level': _selectedEducation ?? '',
      'occupation': _occupationController.text.trim(),
      'primary_problem': List<String>.from(_selectedProblems),
      // Si seleccionó "Otro", guardar el texto libre; si no, la opción elegida
      'youth_path': (_selectedYouthPath == 'Otro')
          ? 'Otro: ${_youthPathOtherController.text.trim()}'
          : _selectedYouthPath,
      'women_roles': _selectedWomenRoles ?? '',
      'water_source': _selectedWaterSource,
      'has_sewer': _selectedSewer,
      'has_septic': _selectedSeptic ?? '',
      'has_internet': _selectedInternet ?? '',
      'road_status': _selectedRoadStatus ?? '',
      'household_income': _selectedIncome ?? '',
      'political_climate': _selectedPoliticalClimate,
      'authority_trust': _selectedTrust ?? '',
      'social_priority': _selectedSocialPriorities.join('|'),
      'investment_acceptance': _selectedInvestmentAcceptance,
      'mine_reopening_perception': _selectedMineReopening,
      'mine_benefits': List<String>.from(_selectedMineBenefits),
      'mine_risks': List<String>.from(_selectedMineRisks),
      'comments': _commentsController.text.trim(),
      'latitude': _latitudeController.text.trim(),
      'longitude': _longitudeController.text.trim(),
      'road_who_fixes': _selectedRoadWhoFixes ?? '',
      'knows_mining_types': _selectedMiningTypes,
      'knows_mining_benefits': _selectedMiningBenefits,
      'knows_modern_mining': _selectedModernMining,
      'knows_local_mines': _selectedLocalMines,
      'knows_env_guarantees': _selectedEnvGuarantees,
    };

    try {
      // Preparamos payload en JSON limpio
      final Map<String, dynamic> surveyPayload = Map<String, dynamic>.from(newSurvey);
      surveyPayload['primary_problem'] = _selectedProblems.join('|');
      surveyPayload['women_roles'] = _selectedWomenRoles ?? '';
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
    _selectedRoadWhoFixes = null;
    _youthPathOtherController.clear();
    _dateController.text = DateTime.now().toIso8601String().replaceAll('T', ' ').substring(0, 16);
    _surveyorController.text = widget.apiService.currentUser?['display_name'] ?? '';
    setState(() {
      _isSurveyActive = false;
      _isGpsLoadingForSurvey = false;
      _selectedSector = null;
      _selectedGender = null;
      _selectedAgeRange = null;
      _selectedEducation = null;
      _selectedProblems.clear();
      _selectedYouthPath = null;
      _selectedWaterSource = null;
      _selectedSewer = null;
      _selectedSeptic = null;
      _selectedInternet = null;
      _selectedRoadStatus = null;
      _selectedIncome = null;
      _selectedTrust = null;
      _selectedPoliticalClimate = null;
      _selectedSocialPriorities.clear();
      _selectedInvestmentAcceptance = null;
      _selectedMineReopening = null;
      _selectedMiningTypes = null;
      _selectedMiningBenefits = null;
      _selectedModernMining = null;
      _selectedLocalMines = null;
      _selectedEnvGuarantees = null;
      _selectedWomenRoles = null;
      _selectedMineBenefits.clear();
      _selectedMineRisks.clear();
      _gpsStatus = null;
    });
  }

  // Sincroniza la cola local de encuestas pendientes
  Future<void> _syncOfflineSurveys() async {
    if (_offlineSurveys.isEmpty) return;

    // Mostrar indicador de progreso
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Sincronizando ${_offlineSurveys.length} encuesta(s)...'),
          duration: const Duration(seconds: 60),
        ),
      );
    }

    final failed = <Map<String, dynamic>>[];
    final errors = <String>[];
    int synced = 0;

    // Intentamos encuesta por encuesta para no perder ninguna por un fallo puntual
    for (final survey in _offlineSurveys) {
      try {
        // Preparamos payload limpio (igual que en _handleSaveSurvey)
        final payload = Map<String, dynamic>.from(survey);
        if (payload['primary_problem'] is List) {
          payload['primary_problem'] = (payload['primary_problem'] as List).join('|');
        }
        if (payload['mine_benefits'] is List) {
          payload['mine_benefits'] = (payload['mine_benefits'] as List).join('|');
        }
        if (payload['mine_risks'] is List) {
          payload['mine_risks'] = (payload['mine_risks'] as List).join('|');
        }
        if (payload['women_roles'] is List) {
          payload['women_roles'] = (payload['women_roles'] as List).join('|');
        }
        if (payload['social_priority'] is List) {
          payload['social_priority'] = (payload['social_priority'] as List).join('|');
        }

        await widget.apiService.saveSurvey(payload);
        synced++;
      } catch (e) {
        // Guardamos el error y la encuesta para reintento posterior
        failed.add(survey);
        final msg = e.toString().replaceAll('Exception:', '').trim();
        errors.add(msg);
      }
    }

    // Actualizar la cola con solo las que fallaron
    setState(() {
      _offlineSurveys = failed;
    });
    await _saveOfflineSurveys();

    // Descartar el SnackBar de progreso
    if (mounted) ScaffoldMessenger.of(context).hideCurrentSnackBar();

    if (mounted) {
      if (failed.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('¡$synced encuesta(s) sincronizada(s) con éxito!'),
            backgroundColor: const Color(0xFF10B981),
            duration: const Duration(seconds: 4),
          ),
        );
        _fetchMySurveys(); // Refrescar historial remoto
      } else {
        // Mostrar el primer error real para que el encuestador sepa qué pasó
        final errorDetail = errors.isNotEmpty ? '\n${errors.first}' : '';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              synced > 0
                  ? '$synced subida(s) con éxito, ${failed.length} pendiente(s).$errorDetail'
                  : 'No se pudo sincronizar: $errorDetail',
            ),
            backgroundColor: const Color(0xFFEF4444),
            duration: const Duration(seconds: 6),
          ),
        );
      }
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

  // ── Campo de solo lectura con ícono GPS (usado en Identificación y Contexto) ──
  Widget _buildGpsReadOnlyField({
    required String label,
    required String value,
    required IconData icon,
    bool isLoading = false,
    Color iconColor = const Color(0xFF10B981),
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: CoffeePalette.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Color(0xFF10B981).withOpacity(0.25),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          Icon(icon, color: iconColor, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: CoffeePalette.medium,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 3),
                isLoading
                    ? Row(
                        children: [
                          SizedBox(
                            width: 12,
                            height: 12,
                            child: CircularProgressIndicator(
                              strokeWidth: 1.5,
                              valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF10B981)),
                            ),
                          ),
                          SizedBox(width: 8),
                          Text(
                            'Obteniendo del GPS...',
                            style: TextStyle(color: CoffeePalette.medium, fontSize: 13),
                          ),
                        ],
                      )
                    : Text(
                        value.isNotEmpty ? value : '—',
                        style: const TextStyle(
                          color: CoffeePalette.dark,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
              ],
            ),
          ),
          const Icon(Icons.gps_fixed, color: Color(0xFF10B981), size: 14),
        ],
      ),
    );
  }

  // Genera un widget visual para cada sección del formulario de encuesta
  Widget _buildSectionCard({required String title, required List<Widget> children}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 20),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: CoffeePalette.latte, width: 1),
      ),
      color: const Color(0xFFF5EFE6),
      child: ExpansionTile(
        title: Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: CoffeePalette.dark,
            letterSpacing: -0.2,
          ),
        ),
        iconColor: CoffeePalette.medium,
        collapsedIconColor: CoffeePalette.dark,
        childrenPadding: const EdgeInsets.all(20),
        expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
        expandedAlignment: Alignment.topLeft,
        children: children,
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
          backgroundColor: CoffeePalette.background,
          selectedColor: CoffeePalette.medium.withOpacity(0.3),
          checkmarkColor: CoffeePalette.medium,
          labelStyle: TextStyle(
            color: isSelected ? Colors.white : CoffeePalette.medium,
            fontSize: 13,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: BorderSide(
              color: isSelected ? CoffeePalette.medium : CoffeePalette.latte,
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
            colors: [CoffeePalette.background, Color(0xFF020617)],
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
                color: CoffeePalette.dark,
                letterSpacing: -0.5,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              message,
              style: const TextStyle(
                fontSize: 15,
                color: CoffeePalette.medium,
                height: 1.5,
              ),
              textAlign: TextAlign.center,
            ),
            if (adminNotes != null && adminNotes.isNotEmpty) ...[
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Color(0xFFF5EFE6),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: CoffeePalette.latte),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Observaciones de Administración:',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: CoffeePalette.dark,
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
              const CircularProgressIndicator(valueColor: AlwaysStoppedAnimation<Color>(CoffeePalette.medium))
            else ...[
              if (showRefresh) ...[
                ElevatedButton.icon(
                  onPressed: _syncUserProfile,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Refrescar Estado'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: CoffeePalette.medium,
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
                colors: [Color(0xFFF5EFE6), CoffeePalette.background],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: CoffeePalette.latte, width: 1),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: CoffeePalette.medium.withOpacity(0.1),
                    shape: BoxShape.circle,
                    border: Border.all(color: CoffeePalette.medium.withOpacity(0.3), width: 1.5),
                  ),
                  child: const Icon(Icons.waving_hand_outlined, color: CoffeePalette.medium, size: 28),
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
                          color: CoffeePalette.dark,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Bienvenido a tu panel de control.',
                        style: TextStyle(color: CoffeePalette.medium, fontSize: 13),
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
            onTap: () async {
              // Fecha y encuestador se llenan de inmediato al abrir el formulario
              setState(() {
                _isSurveyActive = true;
                _isGpsLoadingForSurvey = true;
                _dateController.text = DateTime.now()
                    .toIso8601String()
                    .replaceAll('T', ' ')
                    .substring(0, 16);
                _surveyorController.text =
                    widget.apiService.currentUser?['display_name'] ?? '';
              });

              try {
                // Si ya hay posición precargada por el listener de fondo, usarla
                if (_latestPosition != null) {
                  await _applyLocationToForm(_latestPosition!, forceUpdate: true);
                } else {
                  // Si el GPS aún no ha capturado nada, capturar ahora con alta precisión
                  await _captureGpsForSurveyStart();
                }
              } finally {
                if (mounted) {
                  setState(() => _isGpsLoadingForSurvey = false);
                }
              }
            },
            borderRadius: BorderRadius.circular(20),
            child: Ink(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [CoffeePalette.background, CoffeePalette.latte],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                border: Border.all(color: CoffeePalette.latte, width: 2),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: CoffeePalette.dark.withOpacity(0.1),
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
                          color: CoffeePalette.dark.withOpacity(0.15),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.assignment_add,
                          color: CoffeePalette.dark,
                          size: 28,
                        ),
                      ),
                      Icon(
                        Icons.arrow_forward_ios,
                        color: CoffeePalette.dark.withOpacity(0.7),
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
                      color: CoffeePalette.dark,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Registra una nueva ficha territorial de campo. Se capturarán datos de vivienda, percepción social y coordenadas GPS.',
                    style: TextStyle(
                      color: CoffeePalette.dark.withOpacity(0.8),
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
                    color: Color(0xFFF5EFE6),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: CoffeePalette.latte, width: 1),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: Color(0xFF10B981).withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.cloud_done, color: Color(0xFF10B981), size: 16),
                      ),
                      const SizedBox(height: 12),
                      _isFetchingMySurveys
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 1.5, valueColor: AlwaysStoppedAnimation<Color>(CoffeePalette.medium)),
                            )
                          : Text(
                              '${_mySurveys.length}',
                              style: const TextStyle(
                                fontFamily: 'Outfit',
                                fontSize: 24,
                                fontWeight: FontWeight.bold,
                                color: CoffeePalette.dark,
                              ),
                            ),
                      const SizedBox(height: 2),
                      const Text(
                        'Sincronizadas',
                        style: TextStyle(color: CoffeePalette.medium, fontSize: 12),
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
                    color: Color(0xFFF5EFE6),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: CoffeePalette.latte, width: 1),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: Color(0xFFF59E0B).withOpacity(0.1),
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
                          color: CoffeePalette.dark,
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Cola Offline',
                        style: TextStyle(color: CoffeePalette.medium, fontSize: 12),
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
              color: CoffeePalette.background,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: CoffeePalette.latte, width: 1),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.location_on_outlined, color: CoffeePalette.medium, size: 18),
                        SizedBox(width: 8),
                        Text('Zona Asignada', style: TextStyle(color: CoffeePalette.medium, fontSize: 13)),
                      ],
                    ),
                    Text(
                      user['assigned_zone'] ?? 'San Bartolomé',
                      style: const TextStyle(color: CoffeePalette.dark, fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                const Divider(color: CoffeePalette.latte, height: 1),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.badge_outlined, color: CoffeePalette.medium, size: 18),
                        SizedBox(width: 8),
                        Text('Rol Operativo', style: TextStyle(color: CoffeePalette.medium, fontSize: 13)),
                      ],
                    ),
                    const Text(
                      'Encuestador de Campo',
                      style: TextStyle(color: CoffeePalette.dark, fontWeight: FontWeight.bold, fontSize: 13),
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
            valueColor: AlwaysStoppedAnimation<Color>(CoffeePalette.medium),
          ),
        ),
      );
    }

    final status = user['account_status'] ?? 'pending';

    if (status == 'pending') {
      return _buildBlockedStateScreen(
        icon: Icons.hourglass_empty,
        color: Color(0xFFF59E0B),
        title: 'Postulación en Revisión',
        message: 'Hola ${user['display_name']}. Tu ficha de postulación de encuestador ha sido registrada correctamente. Actualmente se encuentra bajo revisión administrativa para habilitar tu cuenta de campo.',
      );
    }

    if (status == 'rejected') {
      return _buildBlockedStateScreen(
        icon: Icons.cancel_outlined,
        color: Color(0xFFEF4444),
        title: 'Postulación Rechazada',
        message: 'Lo sentimos, tu solicitud para unirte como encuestador no ha sido aprobada por la administración del sistema.',
        adminNotes: user['review_notes'] ?? 'No se indicaron detalles adicionales.',
      );
    }

    if (status == 'suspended') {
      return _buildBlockedStateScreen(
        icon: Icons.gavel_outlined,
        color: Color(0xFFEF4444),
        title: 'Cuenta Suspendida',
        message: 'Tu cuenta operativa de encuestador ha sido temporalmente suspendida por la administración del sistema. Por favor comunícate con soporte.',
      );
    }

    // --- INTERFAZ ACTIVA APROBADA (WORKSPACE) ---
    return Scaffold(
      appBar: AppBar(
        title: const Text('Workspace de Campo'),
        backgroundColor: CoffeePalette.background,
        foregroundColor: CoffeePalette.dark,
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
          indicatorColor: CoffeePalette.dark,
          labelColor: CoffeePalette.dark,
          unselectedLabelColor: CoffeePalette.medium,
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
                            icon: const Icon(Icons.arrow_back, color: CoffeePalette.medium, size: 20),
                            label: const Text(
                              'Regresar al Panel',
                              style: TextStyle(color: CoffeePalette.medium, fontSize: 14, fontWeight: FontWeight.w600),
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
                          style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: CoffeePalette.dark),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Realiza el levantamiento social. Recuerda capturar las coordenadas GPS obligatoriamente.',
                          style: TextStyle(color: CoffeePalette.medium, fontSize: 13),
                        ),
                        const SizedBox(height: 24),

                  // ══════════════════════════════════════════════
                  // SECCIÓN 1 — IDENTIFICACIÓN Y CONTEXTO
                  // Campos auto-rellenados por GPS. NO EDITABLES.
                  // ══════════════════════════════════════════════
                  _buildSectionCard(
                    title: 'Identificación y Contexto',
                    children: [

                      // Encabezado GPS
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: Color(0xFF10B981).withOpacity(0.08),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Color(0xFF10B981).withOpacity(0.2)),
                        ),
                        child: Row(
                          children: [
                            _isGpsLoadingForSurvey
                                ? const SizedBox(
                                    width: 14,
                                    height: 14,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 1.5,
                                      valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF10B981)),
                                    ),
                                  )
                                : const Icon(Icons.satellite_alt, color: Color(0xFF10B981), size: 14),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _isGpsLoadingForSurvey
                                    ? 'Obteniendo señal GPS y detectando zona...'
                                    : (_latestPosition != null
                                        ? 'GPS activo · Precisión ±${_latestPosition!.accuracy.toStringAsFixed(0)} m · Campos auto-completados'
                                        : 'Campos detectados automáticamente por GPS'),
                                style: TextStyle(
                                  color: _isGpsLoadingForSurvey
                                      ? CoffeePalette.medium
                                      : Color(0xFF10B981),
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            if (!_isGpsLoadingForSurvey)
                              GestureDetector(
                                onTap: () async {
                                  setState(() => _isGpsLoadingForSurvey = true);
                                  await _captureGpsForSurveyStart();
                                  if (mounted) setState(() => _isGpsLoadingForSurvey = false);
                                },
                                child: const Tooltip(
                                  message: 'Actualizar ubicación GPS',
                                  child: Icon(Icons.refresh, color: Color(0xFF10B981), size: 16),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),

                      // PREGUNTA 1 — Sector (GPS, no editable)
                      _buildGpsReadOnlyField(
                        label: '1. SECTOR',
                        value: _selectedSector ?? '',
                        icon: Icons.map_outlined,
                        isLoading: _isGpsLoadingForSurvey && _selectedSector == null,
                      ),
                      const SizedBox(height: 10),

                      // PREGUNTA 2 — Centro Parroquial / Barrio (GPS, no editable)
                      _buildGpsReadOnlyField(
                        label: '2. CENTRO PARROQUIAL O BARRIO',
                        value: _communityController.text,
                        icon: Icons.location_on_outlined,
                        isLoading: _isGpsLoadingForSurvey && _communityController.text.isEmpty,
                      ),
                      const SizedBox(height: 10),

                      // PREGUNTA 3 — Fecha y hora (automática, no editable)
                      _buildGpsReadOnlyField(
                        label: '3. FECHA Y HORA',
                        value: _dateController.text,
                        icon: Icons.calendar_today_outlined,
                        iconColor: CoffeePalette.medium,
                      ),
                      const SizedBox(height: 10),

                      // PREGUNTA 4 — Encuestador asignado (sesión, no editable)
                      _buildGpsReadOnlyField(
                        label: '4. ENCUESTADOR ASIGNADO',
                        value: _surveyorController.text,
                        icon: Icons.person_outline,
                        iconColor: CoffeePalette.medium,
                      ),

                      // Coordenadas GPS (referencia técnica, visible pero no editable)
                      if (_latestPosition != null && !_isGpsLoadingForSurvey) ...[
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          decoration: BoxDecoration(
                            color: CoffeePalette.background,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: CoffeePalette.latte),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.gps_not_fixed, color: Color(0xFF475569), size: 14),
                              const SizedBox(width: 8),
                              Text(
                                'Lat: ${_latestPosition!.latitude.toStringAsFixed(6)}  '
                                'Lon: ${_latestPosition!.longitude.toStringAsFixed(6)}',
                                style: const TextStyle(
                                  color: CoffeePalette.medium,
                                  fontSize: 11,
                                  fontFamily: 'monospace',
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),

                  // Sección 2: Datos del Encuestado
                  _buildSectionCard(
                    title: 'Datos del Encuestado',
                    children: [
                      TextFormField(
                        controller: _namesController,
                        style: const TextStyle(color: CoffeePalette.dark),
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(
                          labelText: 'Nombres (opcional)',
                          prefixIcon: Icon(Icons.person_outline, color: CoffeePalette.dark),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _lastNamesController,
                        style: const TextStyle(color: CoffeePalette.dark),
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(
                          labelText: 'Apellidos (opcional)',
                          prefixIcon: Icon(Icons.person, color: CoffeePalette.dark),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _idDocumentController,
                        style: const TextStyle(color: CoffeePalette.dark),
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Cédula / Documento (opcional)',
                          prefixIcon: Icon(Icons.badge_outlined, color: CoffeePalette.dark),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _emailController,
                        style: const TextStyle(color: CoffeePalette.dark),
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'Correo Electrónico (opcional)',
                          prefixIcon: Icon(Icons.email_outlined, color: CoffeePalette.dark),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _phoneController,
                        style: const TextStyle(color: CoffeePalette.dark),
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: 'Número de Celular (opcional)',
                          prefixIcon: Icon(Icons.phone_outlined, color: CoffeePalette.dark),
                        ),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        style: const TextStyle(color: CoffeePalette.dark),
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Género'),
                        value: _selectedGender,
                        items: _genders.map((gen) => DropdownMenuItem<String>(value: gen, child: Text(gen))).toList(),
                        validator: (value) => value == null ? 'Seleccione género' : null,
                        onChanged: (val) => setState(() => _selectedGender = val),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        style: const TextStyle(color: CoffeePalette.dark),
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Rango de Edad'),
                        value: _selectedAgeRange,
                        items: _ageRanges.map((age) => DropdownMenuItem<String>(value: age, child: Text(age))).toList(),
                        validator: (value) => value == null ? 'Seleccione rango de edad' : null,
                        onChanged: (val) => setState(() => _selectedAgeRange = val),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        style: const TextStyle(color: CoffeePalette.dark),
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Nivel Educativo'),
                        value: _selectedEducation,
                        items: ['Primaria', 'Secundaria', 'Técnico', 'Universitario', 'Ninguno']
                            .map((edu) => DropdownMenuItem<String>(value: edu, child: Text(edu)))
                            .toList(),
                        onChanged: (val) => setState(() => _selectedEducation = val),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _occupationController,
                        style: const TextStyle(color: CoffeePalette.dark),
                        decoration: const InputDecoration(
                          labelText: 'Ocupación Principal (opcional)',
                          hintText: 'Ej. Agricultor, Ama de casa...',
                        ),
                      ),
                    ],
                  ),
                  _buildSectionCard(
                    title: 'Problemáticas y Dinámica Social',
                    children: [
                      const Text(
                        'Problemáticas principales actuales (Selecciona una o más):',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      _buildMultiSelectChips(
                        options: _problems,
                        selectedList: _selectedProblems,
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        '¿A qué se dedican los jóvenes al terminar sus estudios?',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 10),
                      // Selector tipo chips — uno por opción, incluyendo "Otro"
                      ...(_youthPaths.map((path) {
                        final isSelected = _selectedYouthPath == path;
                        return GestureDetector(
                          onTap: () => setState(() {
                            _selectedYouthPath = path;
                            // Limpiar campo libre si cambia a otra opción
                            if (path != 'Otro') _youthPathOtherController.clear();
                          }),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? CoffeePalette.medium.withOpacity(0.15)
                                  : CoffeePalette.background,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: isSelected
                                    ? CoffeePalette.medium
                                    : CoffeePalette.latte,
                                width: isSelected ? 1.5 : 1,
                              ),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  isSelected
                                      ? Icons.radio_button_checked
                                      : Icons.radio_button_unchecked,
                                  color: isSelected
                                      ? CoffeePalette.medium
                                      : Color(0xFF475569),
                                  size: 20,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    path,
                                    style: TextStyle(
                                      color: isSelected ? Colors.white : CoffeePalette.medium,
                                      fontSize: 14,
                                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      }).toList()),
                      // Campo de texto libre — solo visible si selecciona "Otro"
                      if (_selectedYouthPath == 'Otro') ...[
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _youthPathOtherController,
                          style: const TextStyle(color: CoffeePalette.dark),
                          autofocus: true,
                          decoration: const InputDecoration(
                            labelText: 'Especifica cuál (opcional)',
                            hintText: 'Escribe el destino de los jóvenes...',
                            prefixIcon: Icon(Icons.edit_outlined, color: CoffeePalette.medium, size: 18),
                          ),
                        ),
                        const SizedBox(height: 4),
                      ],
                      const SizedBox(height: 16),
                      const Text(
                        'Limitaciones economicas frecuentes para mujeres que trabajan en el sector:',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _womenRolesOptions.map((opt) {
                          final isSelected = _selectedWomenRoles == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) {
                              setState(() {
                                _selectedWomenRoles = selected ? opt : null;
                              });
                            },
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(
                                color: isSelected
                                    ? CoffeePalette.medium
                                    : CoffeePalette.latte,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),

                  // Sección 3: Condiciones del Hogar
                  _buildSectionCard(
                    title: 'Condiciones de Hogar y Validación',
                    children: [
                      // — Fuente principal de agua —
                      const Text(
                        'Fuente principal de agua',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _waterSources.map((opt) {
                          final isSelected = _selectedWaterSource == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) {
                              setState(() => _selectedWaterSource = selected ? opt : null);
                            },
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(
                                color: isSelected ? CoffeePalette.medium : CoffeePalette.latte,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // — Alcantarillado —
                      const Text(
                        'Alcantarillado',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _sewerOptions.map((opt) {
                          final isSelected = _selectedSewer == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) {
                              setState(() => _selectedSewer = selected ? opt : null);
                            },
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(
                                color: isSelected ? CoffeePalette.medium : CoffeePalette.latte,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // — Fosa Séptica —
                      const Text(
                        'Fosa séptica',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _septicOptions.map((opt) {
                          final isSelected = _selectedSeptic == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) {
                              setState(() => _selectedSeptic = selected ? opt : null);
                            },
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(
                                color: isSelected ? CoffeePalette.medium : CoffeePalette.latte,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // — Conectividad a Internet —
                      const Text(
                        'Conectividad a Internet',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Casa (modem) o teléfono celular',
                        style: TextStyle(color: CoffeePalette.medium, fontSize: 12),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _internetOptions.map((opt) {
                          final isSelected = _selectedInternet == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) {
                              setState(() => _selectedInternet = selected ? opt : null);
                            },
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(
                                color: isSelected ? CoffeePalette.medium : CoffeePalette.latte,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // — Estado de vías —
                      const Text(
                        'Estado de vías',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _roadStatusOptions.map((opt) {
                          final isSelected = _selectedRoadStatus == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) {
                              setState(() => _selectedRoadStatus = selected ? opt : null);
                            },
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(
                                color: isSelected ? CoffeePalette.medium : CoffeePalette.latte,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // — ¿Quién debe arreglar las vías? —
                      const Text(
                        '¿Quién debe arreglar las vías?',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _roadWhoFixesOptions.map((opt) {
                          final isSelected = _selectedRoadWhoFixes == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) {
                              setState(() => _selectedRoadWhoFixes = selected ? opt : null);
                            },
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(
                                color: isSelected ? CoffeePalette.medium : CoffeePalette.latte,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // — Ingresos del hogar —
                      const Text(
                        'Ingresos del hogar',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _incomeOptions.map((opt) {
                          final isSelected = _selectedIncome == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) {
                              setState(() => _selectedIncome = selected ? opt : null);
                            },
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(
                                color: isSelected ? CoffeePalette.medium : CoffeePalette.latte,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // — Confianza en autoridades —
                      const Text(
                        'Confianza en autoridades',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _trustOptions.map((opt) {
                          final isSelected = _selectedTrust == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) {
                              setState(() => _selectedTrust = selected ? opt : null);
                            },
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(
                                color: isSelected ? CoffeePalette.medium : CoffeePalette.latte,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),

                  // Sección 4: Clima Político y Percepción Territorial
                  _buildSectionCard(
                    title: 'Clima Político y Percepción',
                    children: [
                      const Text(
                        '¿Cómo se está manejando la parte política local?',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _politicalClimates.map((opt) {
                          final isSelected = _selectedPoliticalClimate == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) {
                              setState(() => _selectedPoliticalClimate = selected ? opt : null);
                            },
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(
                                color: isSelected ? CoffeePalette.medium : CoffeePalette.latte,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 14),
                      const Text(
                        'Si aparecen inversiones externas, ¿en qué invertir? (puede elegir varias)',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      _buildMultiSelectChips(
                        options: _socialPriorities,
                        selectedList: _selectedSocialPriorities,
                      ),
                      const SizedBox(height: 16),

                      // — ¿Conoce de minería subterránea, a cielo abierto o combinada? —
                      const Text(
                        '¿Conoce usted de minería subterránea, a cielo abierto o combinada?',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _miningTypesOptions.map((opt) {
                          final isSelected = _selectedMiningTypes == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) => setState(() => _selectedMiningTypes = selected ? opt : null),
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(color: isSelected ? CoffeePalette.medium : CoffeePalette.latte),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // — ¿Conoce los beneficios de la minería a gob. locales y alrededores? —
                      const Text(
                        '¿Conoce usted los beneficios que da la minería a los Gobiernos locales y a la gente de los alrededores?',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _miningBenefitsOptions.map((opt) {
                          final isSelected = _selectedMiningBenefits == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) => setState(() => _selectedMiningBenefits = selected ? opt : null),
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(color: isSelected ? CoffeePalette.medium : CoffeePalette.latte),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // — Aceptación frente a proyectos de inversión externa —
                      const Text(
                        'Aceptación frente a proyectos de inversión externa que prometen empleo',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _investmentAcceptances.map((opt) {
                          final isSelected = _selectedInvestmentAcceptance == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) => setState(() => _selectedInvestmentAcceptance = selected ? opt : null),
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(color: isSelected ? CoffeePalette.medium : CoffeePalette.latte),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // — ¿Cómo beneficiaría proyectos como la minería moderna? —
                      const Text(
                        '¿Cómo creen que beneficiaría proyectos alternativos como la minería moderna sin contaminación?',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _mineReopenings.map((opt) {
                          final isSelected = _selectedMineReopening == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) => setState(() => _selectedMineReopening = selected ? opt : null),
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(color: isSelected ? CoffeePalette.medium : CoffeePalette.latte),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // — Beneficios esperados (multi-selección) —
                      const Text(
                        'Beneficios esperados de un proyecto minero en su localidad',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      _buildMultiSelectChips(
                        options: _mineBenefitsOptions,
                        selectedList: _selectedMineBenefits,
                      ),
                      const SizedBox(height: 16),

                      // — Riesgos más temidos (multi-selección) —
                      const Text(
                        'Riesgos más temidos',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      _buildMultiSelectChips(
                        options: _mineRisksOptions,
                        selectedList: _selectedMineRisks,
                      ),
                      const SizedBox(height: 16),

                      // — Pregunta 8: Minería moderna de bajo impacto —
                      const Text(
                        '¿Conoce usted que la minería moderna puede ser de bajo impacto ambiental y de beneficio para la localidad donde se encuentra?',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _modernMiningOptions.map((opt) {
                          final isSelected = _selectedModernMining == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) => setState(() => _selectedModernMining = selected ? opt : null),
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(color: isSelected ? CoffeePalette.medium : CoffeePalette.latte),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // — Pregunta 9: Minas aprovechables en su localidad —
                      const Text(
                        '¿Conoce usted si su localidad tiene minas que se puede aprovechar en beneficio del desarrollo local?',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _localMinesOptions.map((opt) {
                          final isSelected = _selectedLocalMines == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) => setState(() => _selectedLocalMines = selected ? opt : null),
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(color: isSelected ? CoffeePalette.medium : CoffeePalette.latte),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 16),

                      // — Pregunta 10: Ministerio del Ambiente y garantías —
                      const Text(
                        '¿Sabía usted que el Ministerio del Ambiente en proyectos mineros exige garantías de fiel cumplimiento para no afectar el agua y suelo?',
                        style: TextStyle(color: CoffeePalette.dark, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8.0,
                        runSpacing: 8.0,
                        children: _envGuaranteesOptions.map((opt) {
                          final isSelected = _selectedEnvGuarantees == opt;
                          return ChoiceChip(
                            label: Text(opt),
                            selected: isSelected,
                            onSelected: (selected) => setState(() => _selectedEnvGuarantees = selected ? opt : null),
                            backgroundColor: CoffeePalette.background,
                            selectedColor: CoffeePalette.medium.withOpacity(0.3),
                            checkmarkColor: CoffeePalette.medium,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.white : CoffeePalette.medium,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(color: isSelected ? CoffeePalette.medium : CoffeePalette.latte),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _commentsController,
                        style: const TextStyle(color: CoffeePalette.dark),
                        maxLines: 3,
                        decoration: const InputDecoration(
                          labelText: 'Observaciones Adicionales',
                          hintText: 'Añade comentarios o detalles del campo...',
                          alignLabelWithHint: true,
                        ),
                      ),
                    ],
                  ),

                  // Mensaje de error GPS si aplica
                  if (_gpsStatus != null && _gpsStatus!.contains('Error')) ...[
                    Container(
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: Color(0xFFEF4444).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Color(0xFFEF4444).withOpacity(0.3)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.location_off, color: Color(0xFFEF4444), size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _gpsStatus!,
                              style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],

                  // Mostrar error del formulario
                  if (_surveyError != null) ...[
                    Container(
                      margin: const EdgeInsets.only(bottom: 20),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: Color(0xFFEF4444).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Color(0xFFEF4444).withOpacity(0.3)),
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

                  // Botón Guardar
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
                    color: Color(0xFFF5EFE6),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: CoffeePalette.latte),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: const BoxDecoration(
                              color: CoffeePalette.medium,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.person, color: CoffeePalette.dark, size: 28),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  user['display_name'] ?? 'Encuestador',
                                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: CoffeePalette.dark),
                                ),
                                Text(
                                  '@${user['username']}',
                                  style: const TextStyle(color: CoffeePalette.medium, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: Color(0xFF10B981).withOpacity(0.1),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: Color(0xFF10B981)),
                            ),
                            child: const Text(
                              'APROBADO',
                              style: TextStyle(color: Color(0xFF10B981), fontSize: 10, fontWeight: FontWeight.bold),
                            ),
                          )
                        ],
                      ),
                      const SizedBox(height: 20),
                      const Divider(color: CoffeePalette.latte),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Zona de Trabajo Asignada:', style: TextStyle(color: CoffeePalette.medium)),
                          Text(
                            user['assigned_zone'] ?? 'San Bartolomé',
                            style: const TextStyle(color: CoffeePalette.dark, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Encuestas Sincronizadas:', style: TextStyle(color: CoffeePalette.medium)),
                          _isFetchingMySurveys
                              ? const SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation<Color>(CoffeePalette.medium)),
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

                // ── Cola Offline ──
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Cola Offline (${_offlineSurveys.length})',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: CoffeePalette.dark),
                    ),
                    if (_offlineSurveys.isNotEmpty)
                      TextButton.icon(
                        onPressed: _syncOfflineSurveys,
                        icon: const Icon(Icons.sync, size: 18),
                        label: const Text('Sincronizar Ahora'),
                      ),
                  ],
                ),
                const SizedBox(height: 12),

                if (_offlineSurveys.isEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 16),
                    decoration: BoxDecoration(
                      color: CoffeePalette.background,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: CoffeePalette.latte),
                    ),
                    child: const Column(
                      children: [
                        Icon(Icons.cloud_done_outlined, color: CoffeePalette.medium, size: 40),
                        const SizedBox(height: 12),
                        Text(
                          'No tienes encuestas pendientes de subir.',
                          style: TextStyle(color: CoffeePalette.medium, fontSize: 13),
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
                            style: const TextStyle(color: CoffeePalette.dark, fontWeight: FontWeight.w600),
                          ),
                          subtitle: Text(
                            'Sector: ${item['sector'] ?? '-'}  ·  Lat: ${item['latitude'] ?? '-'}  Lon: ${item['longitude'] ?? '-'}',
                            style: const TextStyle(color: CoffeePalette.medium, fontSize: 12),
                          ),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline, color: Color(0xFFEF4444)),
                            onPressed: () {
                              setState(() => _offlineSurveys.removeAt(index));
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
          ),
        ],
      ),
    );
  }
}
