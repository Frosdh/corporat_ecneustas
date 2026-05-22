import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../services/api_service.dart';

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
      backgroundColor: const Color(0xFF1E293B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SafeArea(
          child: Wrap(
            children: [
              ListTile(
                leading: const Icon(Icons.camera_alt_outlined, color: Color(0xFF3B82F6)),
                title: const Text('Tomar foto con Cámara', style: TextStyle(color: Colors.white)),
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
                leading: const Icon(Icons.photo_library_outlined, color: Color(0xFF3B82F6)),
                title: const Text('Elegir de Galería', style: TextStyle(color: Colors.white)),
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
        // Diálogo estético de éxito
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (context) {
            return AlertDialog(
              backgroundColor: const Color(0xFF1E293B),
              icon: const Icon(Icons.check_circle_outline, color: Color(0xFF10B981), size: 48),
              title: const Text('¡Postulación Registrada!'),
              content: const Text(
                'Tu postulación ha sido enviada con éxito. Queda en estado pendiente de revisión por la administración para habilitar tu cuenta.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF94A3B8)),
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

  // Genera un widget visual para cada sección del formulario
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

  // Widget para botones de captura de adjuntos
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
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: hasFile ? const Color(0xFF10B981).withOpacity(0.5) : const Color(0xFF334155),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          Icon(
            hasFile ? Icons.check_circle : Icons.cloud_upload_outlined,
            color: hasFile ? const Color(0xFF10B981) : const Color(0xFF3B82F6),
            size: 28,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14),
                ),
                Text(
                  hasFile ? 'Archivo seleccionado' : 'Sin archivo adjunto',
                  style: TextStyle(
                    color: hasFile ? const Color(0xFF10B981) : const Color(0xFF64748B),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: onTap,
            style: ElevatedButton.styleFrom(
              backgroundColor: hasFile ? const Color(0xFF334155) : const Color(0xFF3B82F6),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              minimumSize: Size.zero,
            ),
            child: Text(hasFile ? 'Cambiar' : 'Subir'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Crear Ficha de Postulación'),
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Postulación de Encuestador',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Completa tu perfil profesional para recibir tu credencial de campo.',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
                ),
                const SizedBox(height: 24),

                // Sección 1: Datos Personales
                _buildSectionCard(
                  title: 'Datos Personales',
                  children: [
                    TextFormField(
                      controller: _fullNameController,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(labelText: 'Nombres Completos'),
                      validator: (value) => value!.trim().isEmpty ? 'Nombres son obligatorios.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _documentController,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(labelText: 'Cédula de Identidad'),
                      keyboardType: TextInputType.number,
                      validator: (value) => value!.trim().isEmpty ? 'Cédula es obligatoria.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _phoneController,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(labelText: 'Celular / Teléfono'),
                      keyboardType: TextInputType.phone,
                      validator: (value) => value!.trim().isEmpty ? 'Celular es obligatorio.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _emailController,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(labelText: 'Correo Electrónico'),
                      keyboardType: TextInputType.emailAddress,
                      validator: (value) {
                        if (value!.trim().isEmpty) return 'Correo es obligatorio.';
                        if (!value.contains('@')) return 'Correo no es válido.';
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _addressController,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(labelText: 'Dirección Domiciliaria'),
                      validator: (value) => value!.trim().isEmpty ? 'Dirección es obligatoria.' : null,
                    ),
                  ],
                ),

                // Sección 2: Territorio y Experiencia
                _buildSectionCard(
                  title: 'Territorio y Experiencia',
                  children: [
                    TextFormField(
                      controller: _parishController,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(labelText: 'Parroquia de residencia'),
                      validator: (value) => value!.trim().isEmpty ? 'Parroquia es obligatoria.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _cantonController,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(labelText: 'Cantón de residencia'),
                      validator: (value) => value!.trim().isEmpty ? 'Cantón es obligatorio.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _requestedZoneController,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(labelText: 'Zona/Sector solicitado para encuestar'),
                      validator: (value) => value!.trim().isEmpty ? 'Zona es obligatoria.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _experienceController,
                      style: const TextStyle(color: Colors.white),
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Experiencia Previa',
                        alignLabelWithHint: true,
                        hintText: 'Describe tu trabajo previo en encuestas o actividades sociales...',
                      ),
                      validator: (value) => value!.trim().isEmpty ? 'Describe tu experiencia.' : null,
                    ),
                  ],
                ),

                // Sección 3: Credenciales de Acceso
                _buildSectionCard(
                  title: 'Credenciales del Sistema',
                  children: [
                    TextFormField(
                      controller: _usernameController,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(labelText: 'Nombre de usuario deseado'),
                      validator: (value) => value!.trim().isEmpty ? 'Usuario es obligatorio.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _passwordController,
                      style: const TextStyle(color: Colors.white),
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Contraseña (mínimo 8 caracteres)'),
                      validator: (value) {
                        if (value == null || value.isEmpty) return 'Clave es obligatoria.';
                        if (value.length < 8) return 'Clave debe tener mínimo 8 caracteres.';
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _passwordConfirmController,
                      style: const TextStyle(color: Colors.white),
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Confirmar Contraseña'),
                      validator: (value) {
                        if (value == null || value.isEmpty) return 'Confirma tu clave.';
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
                            _errorMessage!,
                            style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13),
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
