<script setup lang="ts">
import { useField } from 'vee-validate'

import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

const { value, errorMessage } = useField<string>('remark')
</script>

<template>
  <Field :data-invalid="errorMessage ? true : undefined">
    <FieldLabel>Remark</FieldLabel>
    <Textarea
      v-model="value"
      name="remark"
      placeholder="Why you confirm or how you corrected this record (optional)"
      :aria-invalid="errorMessage ? true : undefined"
    />
    <FieldError v-if="errorMessage">{{ errorMessage }}</FieldError>
  </Field>
</template>
