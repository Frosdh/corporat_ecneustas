import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/gps_service.dart';
import '../theme/coffee_palette.dart';
import 'register_screen.dart';
import 'surveyor_home_screen.dart';

class LoginScreen extends StatefulWidget {
  final ApiService apiService;

  const LoginScreen({Key? key, required this.apiService}) : super(key: key);

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController(text: 'admin_general'); // Admin predeterminado para pruebas fáciles
  final _passwordController = TextEditingController();
  
  bool _isObscured = true;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  // Abre un diálogo de configuración para cambiar la URL de la API fácilmente
  void _showSettingsDialog() {
    final controller = TextEditingController(text: widget.apiService.baseUrl);
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Ajustes de Servidor'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Indica la URL base de tu API de PHP local o de producción:',
                style: TextStyle(fontSize: 14, color: Color(0xFF94A3B8)),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                decoration: const InputDecoration(
                  labelText: 'URL Base de API',
                  hintText: 'https://ejemplo.com/api.php',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar', style: TextStyle(color: Color(0xFF64748B))),
            ),
            ElevatedButton(
              onPressed: () async {
                final newUrl = controller.text.trim();
                if (newUrl.isNotEmpty) {
                  await widget.apiService.setBaseUrl(newUrl);
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('URL del servidor actualizada a: $newUrl')),
                  );
                }
              },
              child: const Text('Guardar'),
            ),
          ],
        );
      },
    );
  }

  // Realiza el login a través de la API
  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final username = _usernameController.text.trim();
      final password = _passwordController.text;

      // 1. Login en la API
      await widget.apiService.login(username, password);

      // 2. Capturar ubicación GPS automáticamente después del login
      GeoLocationResult? locationInfo;
      try {
        final position = await GpsService.determinePosition();
        locationInfo = await GpsService.getFullLocationInfo(position.latitude, position.longitude);
        
        if (locationInfo != null) {
          // Guardamos en preferencias compartidas para usar en el formulario de encuesta
          await widget.apiService.saveUserLocation(

            latitude: position.latitude,
            longitude: position.longitude,
            barrio: locationInfo.barrioName,
            sectorValue: locationInfo.sectorValue,
            sectorLabel: locationInfo.sectorLabel,
            zona: locationInfo.zona,
            canton: locationInfo.canton,
            provincia: locationInfo.provincia,
            
          );
          
          // Mostrar confirmación de ubicación capturada
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('✓ Ubicación detectada: ${locationInfo.sectorLabel} - ${locationInfo.barrioName}\n${locationInfo.canton}, ${locationInfo.provincia}'),
                duration: const Duration(seconds: 2),
                backgroundColor: Color(0xFF10B981),
              ),
            );
          }
        }
      } catch (gpsError) {
        // Si falla GPS, continuamos sin ubicación (no es fatal)
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Advertencia GPS: ${gpsError.toString().replaceAll('Exception:', '').trim()}'),
              duration: const Duration(seconds: 3),
              backgroundColor: Color(0xFFF59E0B),
            ),
          );
        }
      }

      if (mounted) {
        // Navegación fluida y reemplazo de pantalla
        Navigator.pushReplacement(
          context,
          PageRouteBuilder(
            pageBuilder: (context, animation1, animation2) => 
                SurveyorHomeScreen(apiService: widget.apiService),
            transitionDuration: Duration.zero,
            reverseTransitionDuration: Duration.zero,
          ),
        );
      }
    } catch (e) {
      setState(() {
        _errorMessage = e.toString().replaceAll('Exception:', '').trim();
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined, color: Color(0xFF94A3B8)),
            tooltip: 'Configurar servidor',
            onPressed: _showSettingsDialog,
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 12.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const SizedBox(height: 16),
              // Brand Pill Badge — gradiente café
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFA67C52), Color(0xFF6F4E37)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: Color(0xFF6F4E37).withOpacity(0.35),
                      blurRadius: 16,
                      offset: const Offset(0, 8),
                    )
                  ],
                ),
                alignment: Alignment.center,
                child: const Text(
                  'EG',
                  style: TextStyle(
                    fontFamily: 'Outfit',
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(height: 28),
              
              Text(
                'Encuestas-Geo',
                style: theme.textTheme.headlineMedium?.copyWith(
                  color: CoffeePalette.dark,
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Mapeo Social Parroquial',
                style: TextStyle(
                  color: CoffeePalette.medium,
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 48),

              // Formulario en Tarjeta café claro
              Container(
                padding: const EdgeInsets.fromLTRB(24.0, 24.0, 24.0, 24.0),
                decoration: BoxDecoration(
                  color: const Color(0xFFF5EFE6),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: CoffeePalette.latte, width: 1.5),
                  boxShadow: [
                    BoxShadow(
                      color: Color(0xFF6F4E37).withOpacity(0.12),
                      blurRadius: 24,
                      offset: const Offset(0, 12),
                    )
                  ],
                ),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Iniciar sesión',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: CoffeePalette.dark,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 20),

                      // Campo de Usuario
                      TextFormField(
                        controller: _usernameController,
                        style: const TextStyle(color: CoffeePalette.dark),
                        decoration: const InputDecoration(
                          labelText: 'Usuario',
                          labelStyle: TextStyle(color: CoffeePalette.medium, fontWeight: FontWeight.w600),
                          floatingLabelBehavior: FloatingLabelBehavior.always,
                          prefixIcon: Icon(Icons.person_outline, color: CoffeePalette.medium),
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Por favor ingresa tu usuario.';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 18),

                      // Campo de Contraseña
                      TextFormField(
                        controller: _passwordController,
                        style: const TextStyle(color: CoffeePalette.dark),
                        obscureText: _isObscured,
                        decoration: InputDecoration(
                          labelText: 'Clave',
                          labelStyle: const TextStyle(color: CoffeePalette.medium, fontWeight: FontWeight.w600),
                          floatingLabelBehavior: FloatingLabelBehavior.always,
                          prefixIcon: const Icon(Icons.lock_outline, color: CoffeePalette.medium),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _isObscured ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                              color: CoffeePalette.medium,
                            ),
                            onPressed: () {
                              setState(() {
                                _isObscured = !_isObscured;
                              });
                            },
                          ),
                        ),
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return 'Por favor ingresa tu contraseña.';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 12),

                      // Mostrar Mensaje de Error
                      if (_errorMessage != null) ...[
                        const SizedBox(height: 8),
                        Container(
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
                                  _errorMessage!,
                                  style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 24),

                      // Botón de Inicio de sesión
                      ElevatedButton(
                        onPressed: _isLoading ? null : _handleLogin,
                        child: _isLoading
                            ? const SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                ),
                              )
                            : const Text('Entrar al sistema'),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 40),

              // Sección para Postularse
              TextButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => RegisterScreen(apiService: widget.apiService),
                    ),
                  );
                },
                child: RichText(
                  text: const TextSpan(
                    style: TextStyle(fontFamily: 'Inter', fontSize: 15),
                    children: [
                      TextSpan(text: '¿No tienes cuenta? ', style: TextStyle(color: Color(0xFF64748B))),
                      TextSpan(
                        text: 'Postúlate aquí',
                        style: TextStyle(
                          color: Color(0xFF3B82F6),
                          fontWeight: FontWeight.bold,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}
