import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../theme/coffee_palette.dart';
import 'login_screen.dart';
import 'register_screen.dart';

class WelcomeScreen extends StatefulWidget {
  final ApiService apiService;
  const WelcomeScreen({Key? key, required this.apiService}) : super(key: key);

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _fade;
  late Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 950),
    );
    _fade = CurvedAnimation(parent: _ctrl, curve: Curves.easeOut);
    _slide = Tween<Offset>(
      begin: const Offset(0, 0.12),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOut));
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _goLogin() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => LoginScreen(apiService: widget.apiService),
      ),
    );
  }

  void _goRegister() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => RegisterScreen(apiService: widget.apiService),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [
              Color(0xFF3E1F08), // café muy oscuro arriba
              Color(0xFF6F4E37), // café medio
              Color(0xFFA67C52), // café claro abajo
            ],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: FadeTransition(
            opacity: _fade,
            child: SlideTransition(
              position: _slide,
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    const SizedBox(height: 48),

                    // ── Logo ──────────────────────────────────────────
                    _Logo(),
                    const SizedBox(height: 24),

                    // ── Nombre ────────────────────────────────────────
                    const Text(
                      'Encuesta Geo',
                      style: TextStyle(
                        fontSize: 38,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 5),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white30),
                      ),
                      child: const Text(
                        'Parroquia San Bartolomé · Azuay',
                        style: TextStyle(
                          fontSize: 13,
                          color: Color(0xFFFFE0B2),
                          letterSpacing: 0.8,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Herramienta de levantamiento de encuestas\nparroquiales con georreferenciación.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 14.5,
                        color: Color(0xFFFFD9A0),
                        height: 1.5,
                      ),
                    ),

                    const SizedBox(height: 36),

                    // ── Cards informativas ────────────────────────────
                    _InfoCard(
                      icon: Icons.location_on_rounded,
                      title: 'Georreferenciada',
                      body:
                          'Cada encuesta registra automáticamente el sector, barrio y coordenadas GPS del encuestador.',
                    ),
                    const SizedBox(height: 12),
                    _InfoCard(
                      icon: Icons.cloud_sync_rounded,
                      title: 'Trabaja sin internet',
                      body:
                          'Guarda encuestas localmente y súbelas al servidor cuando tengas conexión disponible.',
                    ),
                    const SizedBox(height: 12),
                    _InfoCard(
                      icon: Icons.bar_chart_rounded,
                      title: 'Resultados en tiempo real',
                      body:
                          'Los administradores ven el avance y estadísticas de las encuestas al instante.',
                    ),
                    const SizedBox(height: 12),
                    _InfoCard(
                      icon: Icons.shield_rounded,
                      title: 'Acceso controlado',
                      body:
                          'Solo encuestadores aprobados por el administrador pueden registrar datos.',
                    ),

                    const SizedBox(height: 44),

                    // ── Botón principal: Iniciar sesión ───────────────
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _goLogin,
                        icon: const Icon(Icons.login_rounded),
                        label: const Text('Iniciar sesión'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: CoffeePalette.dark,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                          elevation: 0,
                          textStyle: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // ── Botón secundario: Crear cuenta ─────────────────
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _goRegister,
                        icon: const Icon(Icons.person_add_rounded),
                        label: const Text('Crear cuenta / Postularme'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side:
                              const BorderSide(color: Colors.white60, width: 1.5),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                          textStyle: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),

                    const SizedBox(height: 16),
                    const Text(
                      'Gobierno Parroquial de San Bartolomé',
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.white38,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 28),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Logo: pin de ubicación con símbolo de encuesta
// ─────────────────────────────────────────────────────────────
class _Logo extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 110,
      height: 110,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white.withOpacity(0.12),
        border: Border.all(color: Colors.white30, width: 2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.25),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          const Icon(Icons.location_on_rounded, size: 70, color: Colors.white),
          Positioned(
            top: 28,
            child: Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: CoffeePalette.dark,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.list_rounded, size: 16, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Card informativa
// ─────────────────────────────────────────────────────────────
class _InfoCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;

  const _InfoCard({
    required this.icon,
    required this.title,
    required this.body,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white24),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: const Color(0xFFFFCC80), size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  body,
                  style: const TextStyle(
                    color: Color(0xFFFFE0B2),
                    fontSize: 12.5,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
