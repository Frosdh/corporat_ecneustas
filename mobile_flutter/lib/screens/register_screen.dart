import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../theme/coffee_palette.dart';

class RegisterScreen extends StatefulWidget {
  final ApiService apiService;

  const RegisterScreen({Key? key, required this.apiService}) : super(key: key);

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();

  // Controladores de campos
  final _fullNameController = TextEditingController();
  final _documentController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _addressController = TextEditingController();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordConfirmController = TextEditingController();

  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _fullNameController.dispose();
    _documentController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _addressController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    _passwordConfirmController.dispose();
    super.dispose();
  }

  // Enviar formulario
  Future<void> _handleRegister() async {
    setState(() {
      _errorMessage = null;
    });

    if (!_formKey.currentState!.validate()) {
      setState(() {
        _errorMessage = 'Por favor revisa los campos con errores en el formulario.';
      });
      return;
    }

    if (_passwordController.text != _passwordConfirmController.text) {
      setState(() {
        _errorMessage = 'Las contraseñas ingresadas no coinciden.';
      });
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final fields = {
        'full_name': _fullNameController.text.trim(),
        'document_number': _documentController.text.trim(),
        'phone': _phoneController.text.trim(),
        'email': _emailController.text.trim(),
        'address': _addressController.text.trim(),
        // Valores por defecto — administrador los asigna al aprobar
        'parish': 'San Bartolome',
        'canton': 'Sigsig',
        'requested_zone': 'Por asignar',
        'experience': 'Sin especificar',
        'username': _usernameController.text.trim(),
        'password': _passwordController.text,
      };

      // Sin archivos adjuntos — se envía sin documentos
      await widget.apiService.registerApplication(fields, {});

      if (mounted) {
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (context) {
            return AlertDialog(
              backgroundColor: const Color(0xFFF5EFE6),
              icon: const Icon(Icons.check_circle_outline, color: CoffeePalette.medium, size: 48),
              title: const Text(
                '¡Solicitud Enviada!',
                style: TextStyle(color: CoffeePalette.dark, fontWeight: FontWeight.bold),
              ),
              content: const Text(
                'Tu solicitud ha sido registrada con éxito. Queda pendiente de revisión y aprobación por la administración.',
                textAlign: TextAlign.center,
                style: TextStyle(color: CoffeePalette.medium),
              ),
              actions: [
                ElevatedButton(
                  onPressed: () {
                    Navigator.pop(context); // Cierra diálogo
                    Navigator.pop(context); // Vuelve al login
                  },
                  child: const Text('Entendido'),
                ),
              ],
            );
          },
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

  // Tarjeta de sección
  Widget _buildSectionCard({required String title, required List<Widget> children}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFF5EFE6),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: CoffeePalette.latte, width: 1.5),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6F4E37).withOpacity(0.08),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 4,
                height: 20,
                decoration: BoxDecoration(
                  color: CoffeePalette.medium,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: CoffeePalette.dark,
                  letterSpacing: -0.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    );
  }

  // Campo de texto con estilo café uniforme
  InputDecoration _cafeInput(String label, {String? hint, bool multiline = false}) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      labelStyle: const TextStyle(color: CoffeePalette.medium, fontWeight: FontWeight.w600),
      floatingLabelBehavior: FloatingLabelBehavior.always,
      alignLabelWithHint: multiline,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CoffeePalette.background,
      appBar: AppBar(
        title: const Text(
          'Registro de Encuestador',
          style: TextStyle(
            color: CoffeePalette.dark,
            fontWeight: FontWeight.bold,
            fontSize: 17,
          ),
        ),
        backgroundColor: const Color(0xFFF5EFE6),
        foregroundColor: CoffeePalette.dark,
        elevation: 0,
        shadowColor: CoffeePalette.latte,
        surfaceTintColor: Colors.transparent,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: CoffeePalette.latte),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Encabezado
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFFA67C52), Color(0xFF6F4E37)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      alignment: Alignment.center,
                      child: const Text(
                        'EG',
                        style: TextStyle(
                          fontFamily: 'Outfit',
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Encuestas-Geo',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: CoffeePalette.dark,
                            ),
                          ),
                          Text(
                            'Crea tu cuenta para solicitar acceso al sistema',
                            style: TextStyle(color: CoffeePalette.medium, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Sección 1: Datos Personales
                _buildSectionCard(
                  title: 'Datos Personales',
                  children: [
                    TextFormField(
                      controller: _fullNameController,
                      style: const TextStyle(color: CoffeePalette.dark),
                      decoration: _cafeInput('Nombres Completos'),
                      validator: (v) => v!.trim().isEmpty ? 'Nombres son obligatorios.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _documentController,
                      style: const TextStyle(color: CoffeePalette.dark),
                      decoration: _cafeInput('Cédula de Identidad'),
                      keyboardType: TextInputType.number,
                      validator: (v) => v!.trim().isEmpty ? 'Cédula es obligatoria.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _phoneController,
                      style: const TextStyle(color: CoffeePalette.dark),
                      decoration: _cafeInput('Celular / Teléfono'),
                      keyboardType: TextInputType.phone,
                      validator: (v) => v!.trim().isEmpty ? 'Celular es obligatorio.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _emailController,
                      style: const TextStyle(color: CoffeePalette.dark),
                      decoration: _cafeInput('Correo Electrónico'),
                      keyboardType: TextInputType.emailAddress,
                      validator: (v) {
                        if (v!.trim().isEmpty) return 'Correo es obligatorio.';
                        if (!v.contains('@')) return 'Correo no es válido.';
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _addressController,
                      style: const TextStyle(color: CoffeePalette.dark),
                      decoration: _cafeInput('Dirección Domiciliaria'),
                      validator: (v) => v!.trim().isEmpty ? 'Dirección es obligatoria.' : null,
                    ),
                  ],
                ),

                // Sección 2: Credenciales de Acceso
                _buildSectionCard(
                  title: 'Credenciales del Sistema',
                  children: [
                    TextFormField(
                      controller: _usernameController,
                      style: const TextStyle(color: CoffeePalette.dark),
                      decoration: _cafeInput('Nombre de usuario deseado'),
                      validator: (v) => v!.trim().isEmpty ? 'Usuario es obligatorio.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _passwordController,
                      style: const TextStyle(color: CoffeePalette.dark),
                      obscureText: true,
                      decoration: _cafeInput('Contraseña (mínimo 8 caracteres)'),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Clave es obligatoria.';
                        if (v.length < 8) return 'Clave debe tener mínimo 8 caracteres.';
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _passwordConfirmController,
                      style: const TextStyle(color: CoffeePalette.dark),
                      obscureText: true,
                      decoration: _cafeInput('Confirmar Contraseña'),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Confirma tu clave.';
                        return null;
                      },
                    ),
                  ],
                ),

                // Error
                if (_errorMessage != null) ...[
                  Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEF4444).withOpacity(0.08),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.3)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline, color: Color(0xFFEF4444), size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _errorMessage!,
                            style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],

                // Botón Enviar
                ElevatedButton(
                  onPressed: _isLoading ? null : _handleRegister,
                  child: _isLoading
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : const Text('Enviar Solicitud de Registro'),
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
