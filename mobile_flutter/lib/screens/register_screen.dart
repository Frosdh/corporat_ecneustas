import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
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
  final _picker = ImagePicker();

  // Controladores de campos
  final _fullNameController = TextEditingController();
  final _documentController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _addressController = TextEditingController();
  final _parishController = TextEditingController();
  final _cantonController = TextEditingController();
  final _requestedZoneController = TextEditingController();
  final _experienceController = TextEditingController();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordConfirmController = TextEditingController();

  // Archivos adjuntos
  String _profilePhotoPath = '';
  String _idDocumentPath = '';
  String _supportDocumentPath = '';

  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _fullNameController.dispose();
    _documentController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _addressController.dispose();
    _parishController.dispose();
    _cantonController.dispose();
    _requestedZoneController.dispose();
    _experienceController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    _passwordConfirmController.dispose();
    super.dispose();
  }

  // Método interactivo para capturar imágenes usando Cámara o Galería
  Future<void> _pickImage(String type) async {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFFF5EFE6),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SafeArea(
          child: Wrap(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                child: Text(
                  'Adjuntar archivo',
                  style: const TextStyle(
                    color: CoffeePalette.dark,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.camera_alt_outlined, color: CoffeePalette.medium),
                title: const Text('Tomar foto con Cámara',
                    style: TextStyle(color: CoffeePalette.dark, fontWeight: FontWeight.w500)),
                onTap: () async {
                  Navigator.pop(context);
                  final file = await _picker.pickImage(source: ImageSource.camera, imageQuality: 80);
                  if (file != null) {
                    setState(() {
                      if (type == 'profile') _profilePhotoPath = file.path;
                      if (type == 'id') _idDocumentPath = file.path;
                      if (type == 'support') _supportDocumentPath = file.path;
                    });
                  }
                },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined, color: CoffeePalette.medium),
                title: const Text('Elegir de Galería',
                    style: TextStyle(color: CoffeePalette.dark, fontWeight: FontWeight.w500)),
                onTap: () async {
                  Navigator.pop(context);
                  final file = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
                  if (file != null) {
                    setState(() {
                      if (type == 'profile') _profilePhotoPath = file.path;
                      if (type == 'id') _idDocumentPath = file.path;
                      if (type == 'support') _supportDocumentPath = file.path;
                    });
                  }
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  // Enviar formulario multipart
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

    if (_profilePhotoPath.isEmpty || _idDocumentPath.isEmpty) {
      setState(() {
        _errorMessage = 'Debes adjuntar obligatoriamente la Foto Personal y la Foto de la Cédula.';
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
        'parish': _parishController.text.trim(),
        'canton': _cantonController.text.trim(),
        'requested_zone': _requestedZoneController.text.trim(),
        'experience': _experienceController.text.trim(),
        'username': _usernameController.text.trim(),
        'password': _passwordController.text,
      };

      final files = {
        'profile_photo': _profilePhotoPath,
        'id_document': _idDocumentPath,
        'support_document': _supportDocumentPath,
      };

      await widget.apiService.registerApplication(fields, files);

      if (mounted) {
        // Diálogo estético de éxito con paleta café
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (context) {
            return AlertDialog(
              backgroundColor: const Color(0xFFF5EFE6),
              icon: const Icon(Icons.check_circle_outline, color: CoffeePalette.medium, size: 48),
              title: const Text(
                '¡Postulación Registrada!',
                style: TextStyle(color: CoffeePalette.dark, fontWeight: FontWeight.bold),
              ),
              content: const Text(
                'Tu postulación ha sido enviada con éxito. Queda en estado pendiente de revisión por la administración para habilitar tu cuenta.',
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

  // Genera un widget visual para cada sección del formulario — estilo café claro
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
          // Encabezado de sección con línea decorativa café
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

  // Widget para botones de captura de adjuntos — estilo café
  Widget _buildFilePickerTile({
    required String label,
    required String path,
    required VoidCallback onTap,
  }) {
    final hasFile = path.isNotEmpty;
    return Container(
      margin: const EdgeInsets.only(top: 8, bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: hasFile
            ? CoffeePalette.medium.withOpacity(0.08)
            : const Color(0xFFFFF8E1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: hasFile ? CoffeePalette.medium : CoffeePalette.latte,
          width: 1.2,
        ),
      ),
      child: Row(
        children: [
          Icon(
            hasFile ? Icons.check_circle : Icons.cloud_upload_outlined,
            color: hasFile ? CoffeePalette.medium : CoffeePalette.accent,
            size: 28,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                      color: CoffeePalette.dark,
                      fontWeight: FontWeight.w600,
                      fontSize: 14),
                ),
                Text(
                  hasFile ? 'Archivo seleccionado ✓' : 'Sin archivo adjunto',
                  style: TextStyle(
                    color: hasFile ? CoffeePalette.medium : CoffeePalette.latte,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: onTap,
            style: ElevatedButton.styleFrom(
              backgroundColor: hasFile ? CoffeePalette.latte : CoffeePalette.medium,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              minimumSize: Size.zero,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: Text(hasFile ? 'Cambiar' : 'Subir',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
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
          'Postulación de Encuestador',
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
                // Encabezado con insignia EG
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
                            'Completa tu perfil para obtener credencial de campo',
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

                // Sección 2: Territorio y Experiencia
                _buildSectionCard(
                  title: 'Territorio y Experiencia',
                  children: [
                    TextFormField(
                      controller: _parishController,
                      style: const TextStyle(color: CoffeePalette.dark),
                      decoration: _cafeInput('Parroquia de residencia'),
                      validator: (v) => v!.trim().isEmpty ? 'Parroquia es obligatoria.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _cantonController,
                      style: const TextStyle(color: CoffeePalette.dark),
                      decoration: _cafeInput('Cantón de residencia'),
                      validator: (v) => v!.trim().isEmpty ? 'Cantón es obligatorio.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _requestedZoneController,
                      style: const TextStyle(color: CoffeePalette.dark),
                      decoration: _cafeInput('Zona/Sector solicitado para encuestar'),
                      validator: (v) => v!.trim().isEmpty ? 'Zona es obligatoria.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _experienceController,
                      style: const TextStyle(color: CoffeePalette.dark),
                      maxLines: 3,
                      decoration: _cafeInput(
                        'Experiencia Previa',
                        hint: 'Describe tu trabajo previo en encuestas o actividades sociales...',
                        multiline: true,
                      ),
                      validator: (v) => v!.trim().isEmpty ? 'Describe tu experiencia.' : null,
                    ),
                  ],
                ),

                // Sección 3: Credenciales de Acceso
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

                // Sección 4: Documentos de Respaldo
                _buildSectionCard(
                  title: 'Soportes y Documentación',
                  children: [
                    _buildFilePickerTile(
                      label: 'Foto Personal (Perfil)',
                      path: _profilePhotoPath,
                      onTap: () => _pickImage('profile'),
                    ),
                    _buildFilePickerTile(
                      label: 'Foto de la Cédula (Frente)',
                      path: _idDocumentPath,
                      onTap: () => _pickImage('id'),
                    ),
                    _buildFilePickerTile(
                      label: 'Respaldo adicional / CV (Opcional)',
                      path: _supportDocumentPath,
                      onTap: () => _pickImage('support'),
                    ),
                  ],
                ),

                // Mostrar error si existe
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

                // Botón de Enviar Postulación
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
                      : const Text('Enviar Ficha de Postulación'),
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
