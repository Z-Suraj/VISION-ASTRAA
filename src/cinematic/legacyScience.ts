import { buildSimilarityMatrix, computeMorphometricClusters, evaluateSimilarity } from '../shared/legacyMath.ts'
import { INITIAL_ANALOG_SITES, INITIAL_DATASETS } from '../server/seedData.ts'
import type { MorphometricNormalization, SimilarityWeights } from '../types/astraa.ts'

export type { AnalogSite, DatasetRecord, MorphometricClusteringResult, SimilarityEvaluation, SimilarityWeights } from '../types/astraa.ts'

export const originalSites = INITIAL_ANALOG_SITES
export const originalDatasets = INITIAL_DATASETS
export const originalWeights: SimilarityWeights = {
  slope: 25,
  ruggedness: 20,
  relief: 15,
  thermal: 15,
  waterIce: 15,
  mineralogy: 10,
}

export function evaluateOriginalSimilarity(earthId: string, targetId: string, weights = originalWeights) {
  const earth = originalSites.find((site) => site.id === earthId && site.body === 'Earth')
  const target = originalSites.find((site) => site.id === targetId && site.body !== 'Earth')
  return earth && target ? evaluateSimilarity(earth, target, weights) : null
}

export function getOriginalClusters(k = 3, normalization: MorphometricNormalization = 'zscore') {
  return computeMorphometricClusters(originalSites, originalDatasets, { k, normalization })
}

export function getOriginalSimilarityMatrix(weights = originalWeights) {
  return buildSimilarityMatrix(originalSites, originalDatasets, weights)
}
