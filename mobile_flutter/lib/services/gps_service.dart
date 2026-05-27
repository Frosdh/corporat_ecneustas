import 'dart:math';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';

class GeoCommunity {
  final String name;
  final double latitude;
  final double longitude;
  final String sectorValue;
  final String sectorLabel;

  const GeoCommunity({
    required this.name,
    required this.latitude,
    required this.longitude,
    required this.sectorValue,
    required this.sectorLabel,
  });
}


/// Resultado completo de una detección de ubicación por GPS
class GeoLocationResult {
  /// Nombre del barrio/comunidad (del geocoder real o de la lista de referencia)
  final String barrioName;

  /// Valor interno del sector (ej. 'centro', 'deleg', 'sallac', 'pishio')
  final String sectorValue;

  /// Etiqueta legible del sector (ej. 'Centro Parroquial', 'La Deleg')
  final String sectorLabel;

  /// Zona/región dentro de la parroquia
  final String zona;

  /// Cantón (extraído del geocodificador real)
  final String canton;

  /// Provincia (extraída del geocodificador real)
  final String provincia;

  /// Comunidad más cercana de la lista de referencia (siempre disponible)
  final GeoCommunity nearestCommunity;

  /// Texto del geocoder real (puede ser null si no hay cobertura)
  final String? geocodedAddress;

  const GeoLocationResult({
    required this.barrioName,
    required this.sectorValue,
    required this.sectorLabel,
    required this.zona,
    required this.canton,
    required this.provincia,
    required this.nearestCommunity,
    this.geocodedAddress,
  });
}

class GpsService {
  // ─────────────────────────────────────────────────────────────────────────
  // Palabras clave que Google Maps / OSM pueden devolver para cada sector.
  // Si el geocoder retorna alguna de estas palabras en cualquier campo,
  // se asigna automáticamente el sector correspondiente.
  // ─────────────────────────────────────────────────────────────────────────
  static const Map<String, List<String>> _sectorKeywords = {
    'centro': [
      'centro parroquial', 'san bartolom', 'plaza', 'parroquia',
      'madelig', 'nuyuzhca', 'isaac calle', 'cuadra', 'colegio',
    ],
    'deleg': [
      'deleg', 'la deleg', 'yanayacu', 'solano',
    ],
    'sallac': [
      'sallac', 'chicty', 'pirca',
    ],
    'pishio': [
      'pishio', 'ramos',
    ],
  };

  static const Map<String, String> _sectorLabels = {
    'centro': 'Centro Parroquial',
    'deleg': 'La Deleg',
    'sallac': 'Sallac',
    'pishio': 'Pishio',
  };

  // Lista de comunidades de referencia para el cálculo de distancia (respaldo offline)
  static const List<GeoCommunity> communities = [
    // Centro Parroquial
    GeoCommunity(name: 'Centro Parroquial', latitude: -3.018868, longitude: -78.857643, sectorValue: 'centro', sectorLabel: 'Centro Parroquial'),
    GeoCommunity(name: 'El Colegio',        latitude: -3.0175,   longitude: -78.8580,   sectorValue: 'centro', sectorLabel: 'Centro Parroquial'),
    GeoCommunity(name: 'La Cuadra',         latitude: -3.0195,   longitude: -78.8555,   sectorValue: 'centro', sectorLabel: 'Centro Parroquial'),
    GeoCommunity(name: 'Madelig',           latitude: -3.0150,   longitude: -78.8565,   sectorValue: 'centro', sectorLabel: 'Centro Parroquial'),
    GeoCommunity(name: 'Isaac Calle',       latitude: -3.0210,   longitude: -78.8600,   sectorValue: 'centro', sectorLabel: 'Centro Parroquial'),
    GeoCommunity(name: 'Nuyuzhca',         latitude: -3.0230,   longitude: -78.8540,   sectorValue: 'centro', sectorLabel: 'Centro Parroquial'),

    // La Deleg
    GeoCommunity(name: 'La Deleg',         latitude: -3.0125,   longitude: -78.8350,   sectorValue: 'deleg',  sectorLabel: 'La Deleg'),
    GeoCommunity(name: 'Deleg Solano',     latitude: -3.0160,   longitude: -78.8310,   sectorValue: 'deleg',  sectorLabel: 'La Deleg'),
    GeoCommunity(name: 'Yanayacu',         latitude: -3.0080,   longitude: -78.8390,   sectorValue: 'deleg',  sectorLabel: 'La Deleg'),

    // Sallac
    GeoCommunity(name: 'Sallac',           latitude: -3.0310,   longitude: -78.8750,   sectorValue: 'sallac', sectorLabel: 'Sallac'),
    GeoCommunity(name: 'Chicty',           latitude: -3.0350,   longitude: -78.8800,   sectorValue: 'sallac', sectorLabel: 'Sallac'),
    GeoCommunity(name: 'Pirca',            latitude: -3.0270,   longitude: -78.8700,   sectorValue: 'sallac', sectorLabel: 'Sallac'),

    // Pishio
    GeoCommunity(name: 'Pishio',           latitude: -3.0420,   longitude: -78.8410,   sectorValue: 'pishio', sectorLabel: 'Pishio'),
    GeoCommunity(name: 'Pishio Alto',      latitude: -3.0460,   longitude: -78.8380,   sectorValue: 'pishio', sectorLabel: 'Pishio'),
    GeoCommunity(name: 'Pishio Bajo',      latitude: -3.0380,   longitude: -78.8440,   sectorValue: 'pishio', sectorLabel: 'Pishio'),
    GeoCommunity(name: 'Ramos',            latitude: -3.0500,   longitude: -78.8450,   sectorValue: 'pishio', sectorLabel: 'Pishio'),
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // Fórmula de Haversine — distancia entre dos coordenadas en kilómetros
  // ─────────────────────────────────────────────────────────────────────────
  static double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
    const p = 0.017453292519943295;
    final a = 0.5 - cos((lat2 - lat1) * p) / 2 +
        cos(lat1 * p) * cos(lat2 * p) * (1 - cos((lon2 - lon1) * p)) / 2;
    return 12742 * asin(sqrt(a));
  }

  // Comunidad más cercana de la lista de referencia (respaldo offline)
  static GeoCommunity? getNearestCommunity(double lat, double lon) {
    if (communities.isEmpty) return null;
    GeoCommunity? nearest;
    double minDistance = double.infinity;
    for (final c in communities) {
      final d = calculateDistance(lat, lon, c.latitude, c.longitude);
      if (d < minDistance) { minDistance = d; nearest = c; }
    }
    return nearest;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Intenta detectar el sectorValue ('centro', 'deleg', 'sallac', 'pishio')
  // buscando palabras clave en los campos que retorna el geocoder de Google Maps.
  // Retorna null si no encuentra coincidencia → usar respaldo por distancia.
  // ─────────────────────────────────────────────────────────────────────────
  static String? _detectSectorFromGeocoderFields(List<String> geocodedFields) {
    // Normalizar a minúsculas y sin tildes para comparar
    final normalized = geocodedFields
        .map((f) => f.toLowerCase()
            .replaceAll('é', 'e').replaceAll('á', 'a')
            .replaceAll('í', 'i').replaceAll('ó', 'o')
            .replaceAll('ú', 'u').replaceAll('ñ', 'n'))
        .toList();

    for (final entry in _sectorKeywords.entries) {
      for (final keyword in entry.value) {
        for (final field in normalized) {
          if (field.contains(keyword)) {
            return entry.key; // sectorValue encontrado
          }
        }
      }
    }
    return null; // sin coincidencia
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MÉTODO PRINCIPAL: Detección completa desde Google Maps + respaldo offline
  //
  // 1. Llama al geocoder del sistema operativo (Google Maps en Android)
  // 2. Intenta detectar sector Y barrio desde los datos reales devueltos
  // 3. Si el geocoder falla o no tiene datos, usa la lista de referencia
  // ─────────────────────────────────────────────────────────────────────────
  static Future<GeoLocationResult?> getFullLocationInfo(double lat, double lon) async {
    // Siempre calculamos el punto más cercano como red de seguridad offline
    final nearest = getNearestCommunity(lat, lon);
    if (nearest == null) return null;

    String sectorValue = nearest.sectorValue;
    String sectorLabel = nearest.sectorLabel;
    String barrioName  = nearest.name;
    String canton      = 'Sígsig';
    String provincia   = 'Azuay';
    String zona        = 'Sierra';
    String? geocodedAddress;

    try {
      // ── Llamada al geocoder real del sistema (Google Maps / OSM) ──
      final placemarks = await placemarkFromCoordinates(lat, lon);

      if (placemarks.isNotEmpty) {
        final p = placemarks.first;

        // Recopilar TODOS los campos de texto que devuelve Google Maps
        // para buscar el sector y el barrio en ellos
        final allGeoFields = <String>[
          p.subLocality           ?? '',  // Barrio/sector más específico
          p.locality              ?? '',  // Ciudad / parroquia
          p.subAdministrativeArea ?? '',  // Cantón
          p.administrativeArea    ?? '',  // Provincia
          p.thoroughfare          ?? '',  // Calle / vía
          p.name                  ?? '',  // Nombre del lugar
        ].where((s) => s.trim().isNotEmpty).toList();

        // 1️⃣ Intentar detectar el SECTOR desde los campos de Google Maps
        final detectedSector = _detectSectorFromGeocoderFields(allGeoFields);
        if (detectedSector != null) {
          sectorValue = detectedSector;
          sectorLabel = _sectorLabels[detectedSector] ?? nearest.sectorLabel;
        }
        // Si no detectó sector en geocoder → mantiene el de distancia (nearest)

        // 2️⃣ El BARRIO viene de subLocality (el campo más específico de Google Maps)
        //    Si está vacío, usamos locality (parroquia) y luego el nombre del punto más cercano
        if (p.subLocality != null && p.subLocality!.trim().isNotEmpty) {
          barrioName = p.subLocality!.trim();
          geocodedAddress = barrioName;
        } else if (p.locality != null && p.locality!.trim().isNotEmpty) {
          barrioName = p.locality!.trim();
          geocodedAddress = barrioName;
        }
        // Si ambos vacíos → barrioName queda como nearest.name

        // 3️⃣ Cantón y Provincia desde Google Maps
        if (p.subAdministrativeArea != null && p.subAdministrativeArea!.trim().isNotEmpty) {
          canton = p.subAdministrativeArea!.trim();
        }
        if (p.administrativeArea != null && p.administrativeArea!.trim().isNotEmpty) {
          provincia = p.administrativeArea!.trim();
        }
      }
    } catch (_) {
      // Sin internet o geocoder no disponible → usar todos los valores por defecto (nearest)
    }

    return GeoLocationResult(
      barrioName:       barrioName,
      sectorValue:      sectorValue,
      sectorLabel:      sectorLabel,
      zona:             zona,
      canton:           canton,
      provincia:        provincia,
      nearestCommunity: nearest,
      geocodedAddress:  geocodedAddress,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Obtiene la posición GPS satelital actual con alta precisión
  // ─────────────────────────────────────────────────────────────────────────
  static Future<Position> determinePosition() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw Exception(
        'Los servicios de ubicación (GPS) están desactivados en tu dispositivo. '
        'Por favor, actívalos en el panel de notificaciones.');
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        throw Exception(
          'Has rechazado los permisos de geolocalización. '
          'La aplicación requiere tu ubicación para asociar las encuestas en campo.');
      }
    }
    if (permission == LocationPermission.deniedForever) {
      throw Exception(
        'Los permisos de geolocalización están denegados permanentemente. '
        'Por favor, habilítalos en los Ajustes de tu teléfono.');
    }

    return await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
      timeLimit: const Duration(seconds: 15),
    );
  }

  // Stream continuo de posición
  static Stream<Position> getPositionStream() {
    return Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5, // Notifica cada 5 metros de movimiento
      ),
    );
  }
}
