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
  // MÉTODO PRINCIPAL: Detección completa desde Google Maps + respaldo offline
  //
  // 1. Llama al geocoder del sistema operativo (Google Maps en Android)
  // 2. Intenta detectar sector Y barrio desde los datos reales devueltos
  // 3. Si el geocoder falla o no tiene datos, usa valores por defecto robustos
  // ─────────────────────────────────────────────────────────────────────────
  static Future<GeoLocationResult?> getFullLocationInfo(double lat, double lon) async {
    String sectorValue = 'San Bartolome';
    String sectorLabel = 'San Bartolome';
    String barrioName  = 'Comunidad Georeferenciada';
    String canton      = 'Sígsig';
    String provincia   = 'Azuay';
    String zona        = 'Sierra';
    String? geocodedAddress;

    try {
      // ── Llamada al geocoder real del sistema (Google Maps / OSM) ──
      final placemarks = await placemarkFromCoordinates(lat, lon);

      if (placemarks.isNotEmpty) {
        final p = placemarks.first;

        // 1️⃣ El BARRIO viene de subLocality (el campo más específico de Google Maps)
        //    Si está vacío, intentamos thoroughfare (calle), name (nombre lugar), o locality (parroquia)
        if (p.subLocality != null && p.subLocality!.trim().isNotEmpty) {
          barrioName = p.subLocality!.trim();
          geocodedAddress = barrioName;
        } else if (p.thoroughfare != null && p.thoroughfare!.trim().isNotEmpty) {
          barrioName = p.thoroughfare!.trim();
          geocodedAddress = barrioName;
        } else if (p.name != null && p.name!.trim().isNotEmpty) {
          barrioName = p.name!.trim();
          geocodedAddress = barrioName;
        } else if (p.locality != null && p.locality!.trim().isNotEmpty) {
          barrioName = p.locality!.trim();
          geocodedAddress = barrioName;
        }

        // 2️⃣ El SECTOR viene de subLocality si está disponible, sino de locality
        if (p.subLocality != null && p.subLocality!.trim().isNotEmpty) {
          sectorValue = p.subLocality!.trim();
        } else if (p.locality != null && p.locality!.trim().isNotEmpty) {
          sectorValue = p.locality!.trim();
        }
        sectorLabel = sectorValue;

        // 3️⃣ Cantón y Provincia desde Google Maps
        if (p.subAdministrativeArea != null && p.subAdministrativeArea!.trim().isNotEmpty) {
          canton = p.subAdministrativeArea!.trim();
        }
        if (p.administrativeArea != null && p.administrativeArea!.trim().isNotEmpty) {
          provincia = p.administrativeArea!.trim();
        }
      }
    } catch (_) {
      // Sin internet o geocoder no disponible → usar valores de fallback robustos
      barrioName = 'Comunidad GPS';
      sectorValue = 'San Bartolome (GPS)';
      sectorLabel = 'San Bartolome (GPS)';
    }

    final nearest = GeoCommunity(
      name: barrioName,
      latitude: lat,
      longitude: lon,
      sectorValue: sectorValue,
      sectorLabel: sectorLabel,
    );

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
