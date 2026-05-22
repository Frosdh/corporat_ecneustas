import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'screens/login_screen.dart';
import 'screens/surveyor_home_screen.dart';
import 'services/api_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  
  // Inicializamos el cliente de API con las preferencias compartidas
  final apiService = ApiService(prefs);
  await apiService.loadSavedSession();

  runApp(MyApp(apiService: apiService));
}

class MyApp extends StatelessWidget {
  final ApiService apiService;

  const MyApp({Key? key, required this.apiService}) : super(key: key);

  @override
  Widget build(BuildContext buildContext) {
    // Definimos un sistema de diseño estético de primer nivel (Premium Dark Blue)
    final ColorScheme darkScheme = const ColorScheme.dark(
      primary: Color(0xFF3B82F6),        // Azul brillante premium
      secondary: Color(0xFFF59E0B),      // Ámbar/Dorado elegante
      surface: Color(0xFF1E293B),        // Slate 800 para tarjetas y paneles
      background: Color(0xFF0F172A),     // Slate 900 de fondo
      error: Color(0xFFEF4444),          // Rojo suave
      onPrimary: Colors.white,
      onSecondary: Colors.black,
      onSurface: Color(0xFFE2E8F0),      // Gris claro premium para lectura limpia
      onBackground: Color(0xFFF8FAFC),
    );

    return MaterialApp(
      title: 'San Bartolomé Móvil',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.dark, // Obligamos a usar el modo oscuro de alto impacto visual
      darkTheme: ThemeData(
        useMaterial3: true,
        colorScheme: darkScheme,
        scaffoldBackgroundColor: darkScheme.background,
        textTheme: const TextTheme(
          headlineMedium: TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.bold, letterSpacing: -0.5),
          titleLarge: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w600, letterSpacing: -0.2),
          bodyMedium: TextStyle(fontFamily: 'Inter', color: Color(0xFF94A3B8)),
        ),
        cardTheme: CardThemeData(
          color: darkScheme.surface,
          elevation: 12,
          shadowColor: Colors.black.withOpacity(0.4),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF1E293B),
          hintStyle: const TextStyle(color: Color(0xFF64748B)),
          labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
          contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFF334155), width: 1),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFF3B82F6), width: 1.5),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFEF4444), width: 1),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: darkScheme.primary,
            foregroundColor: darkScheme.onPrimary,
            elevation: 4,
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            textStyle: const TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.bold, fontSize: 16),
          ),
        ),
      ),
      home: apiService.isLoggedIn
          ? SurveyorHomeScreen(apiService: apiService)
          : LoginScreen(apiService: apiService),
    );
  }
}
