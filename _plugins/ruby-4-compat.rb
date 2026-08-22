# Compatibility for Liquid 4 / Jekyll 3 when previewing with Ruby 4.
unless Object.method_defined?(:tainted?)
  class Object
    def tainted?
      false
    end
  end
end

unless String.method_defined?(:untaint)
  class String
    def untaint
      self
    end
  end
end
