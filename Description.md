# Correction d'altitude Pro Trek

## Objectif

Corriger l'altitude affichée par une Pro Trek en prenant en compte la dérive météorologique entre le moment de calibration et l'instant actuel.

## Méthode employée

### 1. Données météo utilisées

Le script lit les prévisions horaires contenues dans `protrek_forecast.json` et exploite :
- la pression au niveau mer
- la température
- l'humidité relative
- les horaires de validité

### 2. Interpolation temporelle

Les grandeurs météo sont interpolées entre deux heures voisines pour obtenir une valeur au moment précis du calcul.

Pour la pression, on privilégie une interpolation sur le logarithme :

$$
P(t) = \exp\left(\ln(P_0) + f\big(\ln(P_1)-\ln(P_0)\big)\right)
$$

Cette approche est plus réaliste que la simple interpolation linéaire, car la pression atmosphérique suit une évolution quasi exponentielle.

Pour la température et l'humidité, une interpolation de pente locale est utilisée pour éviter les cassures brusques et conserver un comportement plus physiologique.

### 3. Calcul ISA

L'altitude théorique à partir de la pression est calculée avec le modèle ISA standard :

$$
 h = \frac{T_0}{L}\left(1 - \left(\frac{P}{P_0}\right)^{RL/g}\right)
$$

On obtient alors :
- `hTheoreticalCal` : altitude ISA au moment de calibration
- `hTheoreticalCurrent` : altitude ISA au moment actuel

### 4. Dérive barométrique

La correction principale est la différence entre ces deux altitudes théoriques :

$$
\Delta h_{pressure} = h_{current} - h_{cal}
$$

C'est cette valeur qui représente la dérive créée uniquement par la pression atmosphérique.

### 5. Correction thermique

Une correction thermique additionnelle est appliquée pour tenir compte du fait que la température réelle diffère de la température standard ISA.

On compare la température atmosphérique estimée avec la température ISA locale et on applique un terme de correction conservateur de premier ordre.

### 6. Correction hygrométrique

Une petite correction due à l'humidité relative est ajoutée en second ordre. Son impact est faible par rapport à la pression et à la température, mais elle améliore la cohérence du modèle sans le complexifier excessivement.

### 7. Altitude corrigée

La valeur finale est calculée par :

$$
 h_{true} = h_{protrek} - \Delta h_{pressure} + \Delta h_{thermal} + \Delta h_{humidity}
$$

Où :
- `hProtrek` est l'altitude affichée par la Pro Trek
- `Δh_pressure` est la dérive due à la pression
- `Δh_thermal` est la correction thermique
- `Δh_humidity` est la correction hygrométrique

## Limites

Cette méthode reste une approximation réaliste, mais elle ne remplace pas un modèle atmosphérique complet. L'effet réel dépend aussi de :
- gradients thermiques verticaux
- conditions locales de vent
- humidité non uniforme
- précision de l'altimètre instrumenté

## Conclusion

La correction repose sur un modèle hybride :
- pression comme facteur principal
- température comme correction secondaire
- humidité comme correctif mineur

C'est une approche raisonnable pour un usage de randonnée, plus fidèle à la physique que la simple soustraction directe entre deux altitudes ISA.