import 'package:geolocator/geolocator.dart';

class GpsService {
  // Obtiene la ubicación GPS satelital actual con alta precisión
  static Future<Position> determinePosition() async {
    bool serviceEnabled;
    LocationPermission permission;

    // 1. Verificamos si los servicios de localización están habilitados en el teléfono
    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw Exception('Los servicios de ubicación (GPS) están desactivados en tu dispositivo. Por favor, actívalos en el panel de notificaciones.');
    }

    // 2. Comprobamos los permisos de acceso a la ubicación
    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      // Solicitamos los permisos interactivamente
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        throw Exception('Has rechazado los permisos de geolocalización. La aplicación requiere saber tu ubicación para asociar las encuestas en campo.');
      }
    }
    
    if (permission == LocationPermission.deniedForever) {
      // Permisos denegados permanentemente
      throw Exception('Los permisos de geolocalización están denegados permanentemente. Por favor, habilítalos en los ajustes de tu teléfono para poder usar la app móvil.');
    }

    // 3. Capturamos la posición actual con alta precisión
    return await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
      timeLimit: const Duration(seconds: 15), // Evitamos esperas infinitas si hay mala señal
    );
  }
}
