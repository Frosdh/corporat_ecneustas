import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'screens/welcome_screen.dart';
import 'screens/surveyor_home_screen.dart';
import 'services/api_service.dart';
import 'theme/coffee_palette.dart';

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
    // Paleta café/marrón para Encuesta Geo
    final ColorScheme coffeeScheme = ColorScheme.light(
      primary: CoffeePalette.dark,         // café oscuro — botones, AppBar
      secondary: CoffeePalette.accent,      // caramelo — elementos secundarios
      tertiary: CoffeePalette.medium,       // café medio — chips seleccionados
      background: CoffeePalette.background, // crema suave
      surface: Colors.white,
      error: const Color(0xFFB71C1C),
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onTertiary: Colors.white,
      onSurface: const Color(0xFF2D1B00),   // marrón muy oscuro para texto
      onBackground: const Color(0xFF2D1B00),
    );

    return MaterialApp(
      title: 'Encuesta Geo',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.light,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: coffeeScheme,
        scaffoldBackgroundColor: CoffeePalette.background,
        textTheme: const TextTheme(
          headlineMedium: TextStyle(fontWeight: FontWeight.bold, letterSpacing: -0.5, color: Color(0xFF2D1B00)),
          titleLarge: TextStyle(fontWeight: FontWeight.w600, letterSpacing: -0.2, color: Color(0xFF2D1B00)),
          bodyMedium: TextStyle(color: Color(0xFF5D4037)),
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 2,
          shadowColor: CoffeePalette.dark.withOpacity(0.12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: CoffeePalette.surface,
          hintStyle: const TextStyle(color: Color(0xFF9E8E7E)),
          labelStyle: const TextStyle(color: Color(0xFF6D4C41), fontWeight: FontWeight.w500),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFD7BFA4)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFD7BFA4), width: 1.2),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFF6F4E37), width: 2),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFB71C1C), width: 1),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: CoffeePalette.dark,
            foregroundColor: Colors.white,
            elevation: 2,
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
        ),
        dropdownMenuTheme: const DropdownMenuThemeData(
          textStyle: TextStyle(color: Color(0xFF2D1B00)),
        ),
        chipTheme: ChipThemeData(
          backgroundColor: CoffeePalette.surface,
          selectedColor: CoffeePalette.dark,
          checkmarkColor: Colors.white,
          labelStyle: const TextStyle(fontSize: 13, color: Color(0xFF2D1B00)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        ),
      ),
      home: apiService.isLoggedIn
          ? SurveyorHomeScreen(apiService: apiService)
          : WelcomeScreen(apiService: apiService),
    );
  }
}
