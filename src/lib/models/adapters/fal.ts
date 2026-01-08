import { BaseModelAdapter, ModelConfig, GenerationRequest, GenerationResponse } from '../base'

const FAL_API_KEY = process.env.FAL_API_KEY

if (!FAL_API_KEY) {
  console.warn('FAL_API_KEY is not set. FAL.ai models will not work.')
}

/**
 * Seedream v4 Edit Model Configuration
 * Image-to-image generation and editing model by ByteDance
 * Requires reference images as input
 */
export const SEEDREAM_V4_CONFIG: ModelConfig = {
  id: 'fal-seedream-v4',
  name: 'Seedream v4 Edit',
  provider: 'ByteDance',
  type: 'image',
  description: 'Advanced image editing model that transforms images based on text prompts. Requires reference images as input.',
  supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  defaultAspectRatio: '1:1',
  maxResolution: 4096, // Supports up to 4K
  parameters: [
    {
      name: 'aspectRatio',
      type: 'select',
      label: 'Aspect Ratio',
      options: [
        { label: '1:1 (Square)', value: '1:1' },
        { label: '16:9 (Landscape)', value: '16:9' },
        { label: '9:16 (Portrait)', value: '9:16' },
        { label: '4:3 (Landscape)', value: '4:3' },
        { label: '3:4 (Portrait)', value: '3:4' },
      ],
    },
    {
      name: 'numOutputs',
      type: 'number',
      label: 'Number of outputs',
      min: 1,
      max: 4,
      default: 4,
      options: [
        { label: '1', value: 1 },
        { label: '4', value: 4 },
      ],
    },
  ],
}

/**
 * FAL.ai API Adapter
 * Handles image generation via FAL.ai platform
 * Documentation: https://fal.ai/models
 */
export class FalAdapter extends BaseModelAdapter {
  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    this.validateRequest(request)

    try {
      if (this.config.type === 'image') {
        return await this.generateImage(request)
      } else {
        return await this.generateVideo(request)
      }
    } catch (error: any) {
      return {
        id: `error-${Date.now()}`,
        status: 'failed',
        error: error.message || 'Generation failed',
      }
    }
  }

  private async generateImage(request: GenerationRequest): Promise<GenerationResponse> {
    if (!FAL_API_KEY) {
      throw new Error('FAL_API_KEY is not configured. Please add your FAL API key to .env.local and restart the dev server. Get your key from: https://fal.ai/dashboard/keys')
    }

    const {
      modelId,
      prompt,
      parameters = {},
      referenceImage,
    } = request

    // Map aspect ratios to FAL.ai format
    const aspectRatioMap: Record<string, string> = {
      '1:1': 'square',
      '16:9': 'landscape_16_9',
      '9:16': 'portrait_16_9',
      '4:3': 'landscape_4_3',
      '3:4': 'portrait_4_3',
    }

    // Determine the FAL endpoint based on model
    let endpoint = 'fal-ai/bytedance/seedream/v4/edit'
    
    // Handle reference image
    let imageUrl = referenceImage
    
    if (!imageUrl) {
      throw new Error('Seedream requires at least one reference image. Please upload or select an image.')
    }

    // FAL models can accept data URLs directly, so we'll use them as-is
    // If this doesn't work, FAL will return an error and we can adjust
    
    // Get aspect ratio with safe fallback
    const aspectRatio = parameters?.aspectRatio || request.aspectRatio || '1:1'
    const numOutputs = parameters?.numOutputs || request.numOutputs || 1
    
    // Prepare request body
    const body: any = {
      prompt,
      image_size: aspectRatioMap[aspectRatio] || 'square',
      num_images: numOutputs,
      enable_safety_checker: true,
      image_urls: [imageUrl],
    }

    try {
      // Submit generation request to FAL queue
      // Based on official docs: https://docs.fal.ai/model-apis/model-endpoints/queue
      const submitResponse = await fetch(`https://queue.fal.run/${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text()
        let errorMessage = `FAL API error: ${errorText}`
        
        // Parse common FAL.ai error messages
        try {
          const errorJson = JSON.parse(errorText)
          if (errorJson.detail) {
            errorMessage = errorJson.detail
          }
          // Check for common credit/payment errors
          if (errorText.includes('credit') || errorText.includes('payment') || errorText.includes('balance')) {
            errorMessage = 'FAL.ai credits required. Please add credits to your FAL.ai account at https://fal.ai/dashboard/keys'
          }
        } catch (e) {
          // Use raw text if not JSON
        }
        
        throw new Error(errorMessage)
      }

      const submitData = await submitResponse.json()
      const requestId = submitData.request_id

      // Poll for results
      let result
      let attempts = 0
      const maxAttempts = 60 // 5 minutes max

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds

        // Status endpoint for queue API
        const statusUrl = `https://queue.fal.run/submissions/${requestId}`
        console.log(`Checking status at: ${statusUrl}`)
        
        const statusResponse = await fetch(statusUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json',
          },
        })

        console.log(`Status response: ${statusResponse.status} ${statusResponse.statusText}`)

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text()
          console.error(`FAL status error: ${errorText}`)
          throw new Error(`FAL API status check failed (${statusResponse.status}): ${errorText || statusResponse.statusText}`)
        }

        const statusData = await statusResponse.json()

        if (statusData.status === 'COMPLETED') {
          result = statusData
          break
        } else if (statusData.status === 'FAILED') {
          throw new Error(`Generation failed: ${statusData.error || 'Unknown error'}`)
        }

        attempts++
      }

      if (!result) {
        throw new Error('Generation timeout - request took too long')
      }

      // Parse response - the result is in responseData.data
      const responseData = result.response_data || result.data || result.output || {}
      const images = responseData.images || []

      if (!images.length) {
        throw new Error('No images generated')
      }

      // Calculate estimated time (based on actual time taken)
      const estimatedTime = attempts * 5

      return {
        id: `fal-${Date.now()}`,
        status: 'completed',
        outputs: images.map((img: any) => ({
          url: img.url,
          width: img.width || 1024,
          height: img.height || 1024,
        })),
        metadata: {
          seed: responseData.seed,
          model: request.modelId,
          estimatedTime,
        },
      }
    } catch (error: any) {
      console.error('FAL generation error:', error)
      throw new Error(error.message || 'Failed to generate with FAL.ai')
    }
  }

  private async generateVideo(request: GenerationRequest): Promise<GenerationResponse> {
    throw new Error('Video generation not yet implemented for FAL.ai')
  }
}

